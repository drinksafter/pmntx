import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { IdeaDirection } from "@/lib/supabase/types";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** True only for an agent prediction whose corresponding agent_daily_lists row PMNTX itself approved — an unapproved or unevaluated agent pick never reaches Meta. PMNTX Core's own predictions always qualify; they don't go through Agent Selection. */
async function isEligibleForMeta(
  supabase: SupabaseClient,
  prediction: { origin: string; agent_id: string | null; research_run_id: string | null; security_id: string }
): Promise<boolean> {
  if (prediction.origin === "PMNTX_CORE") return true;
  if (!prediction.agent_id || !prediction.research_run_id) return false;

  const { data: agentRun } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("research_run_id", prediction.research_run_id)
    .maybeSingle();
  if (!agentRun) return false;

  const { data: listing } = await supabase
    .from("agent_daily_lists")
    .select("id")
    .eq("agent_run_id", agentRun.id)
    .eq("security_id", prediction.security_id)
    .maybeSingle();
  if (!listing) return false;

  const { data: selection } = await supabase
    .from("pmntx_agent_selections")
    .select("approved")
    .eq("agent_daily_list_id", listing.id)
    .maybeSingle();
  return selection?.approved ?? false;
}

export type MetaConsensusResult = {
  securityId: string;
  status: "COMPUTED" | "NO_CONTRIBUTORS";
  systemsCount: number;
  snapshotId?: string;
};

/**
 * PMNTX Meta's conclusion for one security on one date — the fourth and
 * final layer in the Core / agent / Agent-Selection / Meta distinction
 * (docs/PHASE_1A_SCOPE_LOCK.md §1). Entirely deterministic arithmetic over
 * already-frozen predictions: no AI call, no route, nothing to be
 * NOT_CONFIGURED for. Only PMNTX Core's own prediction and agent
 * predictions PMNTX itself approved (via Agent Selection) contribute —
 * an agent pick PMNTX rejected, or never got to evaluate, has no voice
 * here. Upserts by (security_id, run_date): re-running for the same day
 * recomputes the snapshot as more contributors freeze in, rather than
 * silently missing them — consensus_snapshots has no frozen_at gate
 * (see migration 012), unlike the predictions it summarizes.
 */
export async function computeMetaConsensus(securityId: string, runDate: string): Promise<MetaConsensusResult> {
  const supabase = createServiceRoleClient();

  const { data: sameDayRuns } = await supabase.from("research_runs").select("id").eq("run_date", runDate);
  const sameDayRunIds = (sameDayRuns ?? []).map((r) => r.id);
  if (sameDayRunIds.length === 0) {
    return { securityId, status: "NO_CONTRIBUTORS", systemsCount: 0 };
  }

  const { data: candidatePredictions } = await supabase
    .from("predictions")
    .select("id, origin, agent_id, research_run_id, direction, score, security_id")
    .eq("security_id", securityId)
    .in("research_run_id", sameDayRunIds)
    .not("frozen_at", "is", null);

  const contributors: { direction: IdeaDirection; score: number | null; predictionId: string }[] = [];
  for (const prediction of candidatePredictions ?? []) {
    const eligible = await isEligibleForMeta(supabase, prediction);
    if (eligible) {
      contributors.push({ direction: prediction.direction, score: prediction.score, predictionId: prediction.id });
    }
  }

  if (contributors.length === 0) {
    return { securityId, status: "NO_CONTRIBUTORS", systemsCount: 0 };
  }

  const directionAgreement: Record<string, number> = {};
  for (const c of contributors) {
    directionAgreement[c.direction] = (directionAgreement[c.direction] ?? 0) + 1;
  }

  const scores = contributors.map((c) => c.score).filter((s): s is number => typeof s === "number");

  const predictionIds = contributors.map((c) => c.predictionId);
  const { data: horizons } = await supabase
    .from("prediction_horizons")
    .select("probability_positive")
    .in("prediction_id", predictionIds);
  const probabilities = (horizons ?? [])
    .map((h) => h.probability_positive)
    .filter((p): p is number => typeof p === "number");

  const { data: snapshot, error } = await supabase
    .from("consensus_snapshots")
    .upsert(
      {
        security_id: securityId,
        run_date: runDate,
        systems_count: contributors.length,
        direction_agreement: directionAgreement,
        score_dispersion: stddev(scores),
        probability_dispersion: stddev(probabilities),
        raw_consensus_score: mean(scores),
      },
      { onConflict: "security_id,run_date" }
    )
    .select("id")
    .single();
  if (error || !snapshot) throw new Error(`Failed to upsert consensus_snapshots row: ${error?.message}`);

  return { securityId, status: "COMPUTED", systemsCount: contributors.length, snapshotId: snapshot.id };
}

/** Computes Meta consensus for every security with at least one frozen prediction on the date. */
export async function computeMetaConsensusForDate(runDate: string): Promise<MetaConsensusResult[]> {
  const supabase = createServiceRoleClient();

  const { data: sameDayRuns } = await supabase.from("research_runs").select("id").eq("run_date", runDate);
  const sameDayRunIds = (sameDayRuns ?? []).map((r) => r.id);
  if (sameDayRunIds.length === 0) return [];

  const { data: predictions } = await supabase
    .from("predictions")
    .select("security_id")
    .in("research_run_id", sameDayRunIds)
    .not("frozen_at", "is", null);
  const uniqueSecurityIds = [...new Set((predictions ?? []).map((p) => p.security_id))];

  const results: MetaConsensusResult[] = [];
  for (const securityId of uniqueSecurityIds) {
    results.push(await computeMetaConsensus(securityId, runDate));
  }
  return results;
}
