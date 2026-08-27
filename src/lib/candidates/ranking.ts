import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { computeModelDisagreement } from "./disagreement";
import type { CandidateRankingConfig, RankedCandidate, SecurityScoreInput } from "./types";

/**
 * UNIVERSE -> FEATURES -> CHEAP MODEL SCORES -> RANK -> CANDIDATE SET
 * (pivot brief §14). Pure — no DB access, easy to unit test. Ranks by
 * |compositeScore| (magnitude), matching PMNTx Core's own "a strong SHORT
 * is as noteworthy as a strong LONG" convention (src/lib/pmntx-core/ranking.ts).
 * Preserves each contributing model's own score in scoreComponents and
 * computes disagreement — never collapses multi-model input to a bare
 * average with the disagreement thrown away (pivot brief §15).
 */
export function rankCandidates(inputs: SecurityScoreInput[], config: CandidateRankingConfig): RankedCandidate[] {
  const scored = inputs.map((input) => {
    const compositeScore = input.scores.reduce((sum, s) => sum + s.score, 0) / Math.max(input.scores.length, 1);
    const scoreComponents = Object.fromEntries(input.scores.map((s) => [s.modelCode, s.score]));
    return {
      securityId: input.securityId,
      compositeScore,
      scoreComponents,
      disagreement: computeModelDisagreement(input.scores),
      noveltySignal: input.noveltySignal ?? null,
      materialChangeFlag: input.materialChangeFlag ?? false,
    };
  });

  scored.sort((a, b) => Math.abs(b.compositeScore) - Math.abs(a.compositeScore));

  return scored.map((s, index) => {
    const rank = index + 1;
    const passesThreshold = config.minScoreThreshold == null || Math.abs(s.compositeScore) >= config.minScoreThreshold;
    const selected = rank <= config.maxCandidates && passesThreshold;
    return {
      securityId: s.securityId,
      rank,
      compositeScore: s.compositeScore,
      scoreComponents: s.scoreComponents,
      disagreement: s.disagreement,
      noveltySignal: s.noveltySignal,
      materialChangeFlag: s.materialChangeFlag,
      selected,
      selectionReason: selected
        ? `Ranked #${rank} by composite score (${config.maxCandidates} max candidates).`
        : passesThreshold
          ? `Below rank cutoff (#${rank} > ${config.maxCandidates}).`
          : `Below minimum score threshold.`,
    };
  });
}

export type WriteCandidateRankingsResult = { researchRunId: string; selectedCount: number };

/**
 * Persists a ranked candidate set as its own MODEL-origin research_run —
 * invisible to Morning Brief's PMNTX_CORE/AGENT-only section filters and
 * to PMNTx Meta's origin==='PMNTX_CORE' auto-admit check (see
 * src/lib/predictions/contract.ts's header comment) — mirrors
 * runPmntxCoreRanking's create-run -> do-work -> freeze pattern exactly.
 */
export async function writeCandidateRankings(
  runDate: string,
  modelVersionId: string,
  ranked: RankedCandidate[]
): Promise<WriteCandidateRankingsResult> {
  const supabase = createServiceRoleClient();

  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({ run_date: runDate, origin_type: "MODEL", status: "RUNNING", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (runError || !run) throw runError ?? new Error("Failed to create MODEL research_run.");

  const { error: modelRunError } = await supabase
    .from("model_runs")
    .insert({ model_version_id: modelVersionId, research_run_id: run.id, status: "RUNNING", started_at: new Date().toISOString() });
  if (modelRunError) throw modelRunError;

  const { error: rankingsError } = await supabase.from("candidate_rankings").insert(
    ranked.map((r) => ({
      research_run_id: run.id,
      security_id: r.securityId,
      rank: r.rank,
      score: r.compositeScore,
      score_components: r.scoreComponents,
      selected: r.selected,
      selection_reason: r.selectionReason,
      model_disagreement: r.disagreement,
      novelty_signal: r.noveltySignal,
      material_change_flag: r.materialChangeFlag,
    }))
  );
  if (rankingsError) throw rankingsError;

  const now = new Date().toISOString();
  await supabase.from("model_runs").update({ status: "SUCCEEDED", completed_at: now }).eq("research_run_id", run.id);
  await supabase.from("research_runs").update({ status: "SUCCEEDED", completed_at: now, frozen_at: now }).eq("id", run.id);

  return { researchRunId: run.id, selectedCount: ranked.filter((r) => r.selected).length };
}
