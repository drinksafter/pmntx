import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PerformanceBucket = {
  origin: string;
  agentInternalName: string | null;
  horizon: string;
  resolvedCount: number;
  hitRate: number | null;
  averageReturn: number | null;
};

/**
 * Basic performance tracking, grouped by origin + horizon — enough to
 * measure PMNTX Core and each agent separately, as required. PMNTX Agent
 * Selection and PMNTX Meta don't originate their own predictions (they
 * evaluate/summarize Core's and agents'), so there's no separate
 * "prediction" to attach an outcome to for them directly — see
 * computeAgentSelectionPerformance for the Agent-Selection-specific cut
 * (approved vs. all agent picks). A dedicated Meta-level performance cut
 * (was the consensus direction right?) is derivable from the same
 * consensus_snapshots + resolved-outcome data already recorded here but
 * isn't built as its own query yet — see docs/NEXT_PHASE.md.
 */
export async function computePerformanceSummary(): Promise<PerformanceBucket[]> {
  const supabase = createServiceRoleClient();

  const { data: outcomes } = await supabase
    .from("prediction_outcomes")
    .select("prediction_horizon_id, actual_return, direction_correct")
    .eq("status", "RESOLVED");
  if (!outcomes || outcomes.length === 0) return [];

  const horizonIds = outcomes.map((o) => o.prediction_horizon_id);
  const { data: horizons } = await supabase.from("prediction_horizons").select("id, horizon, prediction_id").in("id", horizonIds);
  const horizonById = new Map((horizons ?? []).map((h) => [h.id, h]));

  const predictionIds = [...new Set((horizons ?? []).map((h) => h.prediction_id))];
  const { data: predictions } = await supabase.from("predictions").select("id, origin, agent_id").in("id", predictionIds);
  const predictionById = new Map((predictions ?? []).map((p) => [p.id, p]));

  const { data: agents } = await supabase.from("agents").select("id, internal_name");
  const agentNameById = new Map((agents ?? []).map((a) => [a.id, a.internal_name]));

  const groups = new Map<
    string,
    { origin: string; agentInternalName: string | null; horizon: string; returns: number[]; correctness: (boolean | null)[] }
  >();

  for (const outcome of outcomes) {
    const horizonRow = horizonById.get(outcome.prediction_horizon_id);
    if (!horizonRow) continue;
    const prediction = predictionById.get(horizonRow.prediction_id);
    if (!prediction) continue;

    const agentInternalName = prediction.agent_id ? (agentNameById.get(prediction.agent_id) ?? null) : null;
    const key = `${prediction.origin}:${horizonRow.horizon}`;
    const group = groups.get(key) ?? {
      origin: prediction.origin,
      agentInternalName,
      horizon: horizonRow.horizon,
      returns: [],
      correctness: [],
    };
    if (typeof outcome.actual_return === "number") group.returns.push(outcome.actual_return);
    group.correctness.push(outcome.direction_correct);
    groups.set(key, group);
  }

  return [...groups.values()].map((g) => {
    const validCorrectness = g.correctness.filter((c): c is boolean => c !== null);
    return {
      origin: g.origin,
      agentInternalName: g.agentInternalName,
      horizon: g.horizon,
      resolvedCount: g.returns.length,
      hitRate: validCorrectness.length ? validCorrectness.filter(Boolean).length / validCorrectness.length : null,
      averageReturn: g.returns.length ? g.returns.reduce((a, b) => a + b, 0) / g.returns.length : null,
    };
  });
}

export type AgentSelectionPerformance = {
  approvedHitRate: number | null;
  approvedCount: number;
  notApprovedHitRate: number | null;
  notApprovedCount: number;
};

/** Compares resolved-outcome hit rate for agent picks PMNTX approved vs. did not — the concrete value-add question for Agent Selection. */
export async function computeAgentSelectionPerformance(): Promise<AgentSelectionPerformance> {
  const supabase = createServiceRoleClient();

  const { data: selections } = await supabase.from("pmntx_agent_selections").select("agent_daily_list_id, approved");
  if (!selections || selections.length === 0) {
    return { approvedHitRate: null, approvedCount: 0, notApprovedHitRate: null, notApprovedCount: 0 };
  }

  const { data: listings } = await supabase
    .from("agent_daily_lists")
    .select("id, agent_run_id, security_id")
    .in("id", selections.map((s) => s.agent_daily_list_id));
  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  const { data: agentRuns } = await supabase.from("agent_runs").select("id, research_run_id");
  const researchRunIdByAgentRunId = new Map((agentRuns ?? []).map((r) => [r.id, r.research_run_id]));

  const approvedReturns: boolean[] = [];
  const notApprovedReturns: boolean[] = [];

  for (const selection of selections) {
    const listing = listingById.get(selection.agent_daily_list_id);
    if (!listing) continue;
    const researchRunId = researchRunIdByAgentRunId.get(listing.agent_run_id);
    if (!researchRunId) continue;

    const { data: prediction } = await supabase
      .from("predictions")
      .select("id")
      .eq("research_run_id", researchRunId)
      .eq("security_id", listing.security_id)
      .not("agent_id", "is", null)
      .maybeSingle();
    if (!prediction) continue;

    const { data: horizon } = await supabase.from("prediction_horizons").select("id").eq("prediction_id", prediction.id).maybeSingle();
    if (!horizon) continue;

    const { data: outcome } = await supabase
      .from("prediction_outcomes")
      .select("direction_correct, status")
      .eq("prediction_horizon_id", horizon.id)
      .maybeSingle();
    if (!outcome || outcome.status !== "RESOLVED" || outcome.direction_correct === null) continue;

    (selection.approved ? approvedReturns : notApprovedReturns).push(outcome.direction_correct);
  }

  return {
    approvedHitRate: approvedReturns.length ? approvedReturns.filter(Boolean).length / approvedReturns.length : null,
    approvedCount: approvedReturns.length,
    notApprovedHitRate: notApprovedReturns.length ? notApprovedReturns.filter(Boolean).length / notApprovedReturns.length : null,
    notApprovedCount: notApprovedReturns.length,
  };
}
