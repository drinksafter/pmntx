import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { composeScore, type HunterContribution } from "./scoring";

// Scores stronger than this in either direction become a LONG/SHORT
// candidate; weaker scores are WATCH. A starting threshold, not a
// calibrated one — see similar caveats in src/lib/hunters/*.
const DIRECTION_THRESHOLD = 0.15;
const MAX_SELECTED = 10;

export type PmntxCoreRunResult = {
  researchRunId: string;
  rankedCount: number;
  selectedCount: number;
};

/**
 * PMNTX Core's daily ranking pass: combines every active Hunter's signal
 * (docs/PHASE_1A_SCOPE_LOCK.md §1) into one composite score per security,
 * ranks the universe, and writes candidate_rankings + daily_rank_snapshots.
 * This is intentionally independent of any agent input — agents read
 * PMNTX Core's output later, never the reverse (docs/PHASE_1A_PLAN.md §11).
 *
 * The research_run is frozen (frozen_at set) the moment this succeeds:
 * PMNTX Core has nothing upstream of it to wait on, unlike agents, which
 * must not read another system's not-yet-frozen work.
 */
export async function runPmntxCoreRanking(asOfDate: string): Promise<PmntxCoreRunResult> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({
      run_date: asOfDate,
      origin_type: "PMNTX_CORE",
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to start PMNTX Core research_run: ${runError?.message}`);
  }

  try {
    const { data: activeDefs } = await supabase
      .from("hunter_definitions")
      .select("id, code")
      .eq("is_active", true);
    const codeByDefId = new Map((activeDefs ?? []).map((d) => [d.id, d.code]));

    const { data: versions } = await supabase
      .from("hunter_versions")
      .select("id, hunter_definition_id");
    const codeByVersionId = new Map(
      (versions ?? [])
        .filter((v) => codeByDefId.has(v.hunter_definition_id))
        .map((v) => [v.id, codeByDefId.get(v.hunter_definition_id) as string])
    );

    const { data: results } = await supabase
      .from("hunter_results")
      .select("security_id, hunter_version_id, normalized_score, confidence, data_quality")
      .eq("as_of_date", asOfDate);

    const bySecurity = new Map<string, HunterContribution[]>();
    for (const r of results ?? []) {
      const hunterCode = codeByVersionId.get(r.hunter_version_id);
      if (!hunterCode) continue; // signal from an inactive/unknown hunter version — excluded
      const list = bySecurity.get(r.security_id) ?? [];
      list.push({
        hunterCode,
        normalizedScore: r.normalized_score,
        confidence: r.confidence,
        dataQuality: r.data_quality,
      });
      bySecurity.set(r.security_id, list);
    }

    const scored = [...bySecurity.entries()].map(([securityId, contributions]) => ({
      securityId,
      ...composeScore(contributions),
    }));

    // Rank by |score| — a strong SHORT candidate is as noteworthy as a
    // strong LONG one, so magnitude drives rank, not raw sign.
    scored.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    const total = scored.length;
    const selectedCount = Math.min(MAX_SELECTED, total);

    for (let i = 0; i < scored.length; i++) {
      const rank = i + 1;
      const { securityId, score, components } = scored[i];
      const percentile = total > 1 ? ((total - rank) / (total - 1)) * 100 : 100;
      const decile = Math.min(10, Math.max(1, Math.ceil((rank / total) * 10)));
      const direction = score > DIRECTION_THRESHOLD ? "LONG" : score < -DIRECTION_THRESHOLD ? "SHORT" : "WATCH";
      const selected = rank <= selectedCount;

      const { error: snapshotError } = await supabase.from("daily_rank_snapshots").upsert(
        { research_run_id: run.id, security_id: securityId, rank, score, percentile, decile },
        { onConflict: "research_run_id,security_id" }
      );
      if (snapshotError) throw snapshotError;

      const { error: rankingError } = await supabase.from("candidate_rankings").upsert(
        {
          research_run_id: run.id,
          security_id: securityId,
          rank,
          score,
          score_components: components,
          selected,
          selection_reason: selected
            ? `Ranked #${rank} of ${total} by |composite score| across active Hunters.`
            : null,
          direction,
        },
        { onConflict: "research_run_id,security_id" }
      );
      if (rankingError) throw rankingError;
    }

    await supabase
      .from("research_runs")
      .update({
        status: "SUCCEEDED",
        completed_at: new Date().toISOString(),
        frozen_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return { researchRunId: run.id, rankedCount: total, selectedCount };
  } catch (err) {
    await supabase
      .from("research_runs")
      .update({
        status: "FAILED",
        completed_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : "Unknown error.",
      })
      .eq("id", run.id);
    throw err;
  }
}
