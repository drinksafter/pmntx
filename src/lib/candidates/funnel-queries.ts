import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type CandidateFunnelSummary = {
  researchRunId: string;
  runDate: string;
  universeScored: number;
  candidates: number;
  routedInvoke: number;
  routedSkip: number;
};

export type CandidateFunnelRow = {
  ticker: string;
  name: string;
  rank: number | null;
  score: number;
  selected: boolean;
  disagreement: number | null;
  routerDecision: string | null;
};

/** Admin-only read model for Admin -> System -> Candidates (the funnel view). Reads the latest MODEL-origin research_run. */
export async function loadLatestCandidateFunnel(): Promise<{ summary: CandidateFunnelSummary | null; rows: CandidateFunnelRow[] }> {
  const supabase = createServiceRoleClient();

  const { data: latestRun } = await supabase
    .from("research_runs")
    .select("id, run_date")
    .eq("origin_type", "MODEL")
    .not("frozen_at", "is", null)
    .order("run_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) return { summary: null, rows: [] };

  const { data: rankings } = await supabase
    .from("candidate_rankings")
    .select("id, security_id, rank, score, selected, model_disagreement")
    .eq("research_run_id", latestRun.id)
    .order("rank", { ascending: true });

  const securityIds = (rankings ?? []).map((r) => r.security_id);
  const { data: securities } = securityIds.length
    ? await supabase.from("securities").select("id, ticker, name").in("id", securityIds)
    : { data: [] };
  const securityById = new Map((securities ?? []).map((s) => [s.id, s]));

  const rankingIds = (rankings ?? []).map((r) => r.id);
  const { data: decisions } = rankingIds.length
    ? await supabase.from("router_decisions").select("candidate_ranking_id, decision").in("candidate_ranking_id", rankingIds)
    : { data: [] };
  const decisionByRankingId = new Map((decisions ?? []).map((d) => [d.candidate_ranking_id, d.decision]));

  const rows: CandidateFunnelRow[] = (rankings ?? []).map((r) => ({
    ticker: securityById.get(r.security_id)?.ticker ?? "?",
    name: securityById.get(r.security_id)?.name ?? "Unknown",
    rank: r.rank,
    score: Number(r.score),
    selected: r.selected,
    disagreement: r.model_disagreement,
    routerDecision: decisionByRankingId.get(r.id) ?? null,
  }));

  const summary: CandidateFunnelSummary = {
    researchRunId: latestRun.id,
    runDate: latestRun.run_date,
    universeScored: rankings?.length ?? 0,
    candidates: (rankings ?? []).filter((r) => r.selected).length,
    routedInvoke: [...decisionByRankingId.values()].filter((d) => d === "INVOKE").length,
    routedSkip: [...decisionByRankingId.values()].filter((d) => d === "SKIP").length,
  };

  return { summary, rows };
}
