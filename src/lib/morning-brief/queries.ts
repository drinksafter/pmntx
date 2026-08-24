import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CorePick = {
  securityId: string;
  ticker: string;
  name: string;
  rank: number | null;
  score: number;
  direction: string;
};

export type AgentPick = {
  agentInternalName: string;
  agentDisplayName: string;
  securityId: string;
  ticker: string;
  direction: string;
  agentScore: number | null;
  thesis: string | null;
};

export type SelectionRow = {
  agentDisplayName: string;
  ticker: string;
  approved: boolean;
  pmntxSecondaryScore: number | null;
  pmntxSecondaryRecommendation: string | null;
  evidenceDiscovered: string | null;
};

export type MetaRow = {
  ticker: string;
  systemsCount: number;
  directionAgreement: Record<string, number>;
  rawConsensusScore: number | null;
};

export type MorningBriefData = {
  runDate: string | null;
  corePicks: CorePick[];
  agentPicks: AgentPick[];
  selections: SelectionRow[];
  meta: MetaRow[];
};

/**
 * Read-only Morning Brief data. Deliberately built on the RLS-respecting
 * server client (not service-role) passed in by the caller — a
 * non-admin user should only ever see FROZEN research, which is exactly
 * what every table's "select_frozen_or_admin" RLS policy already
 * enforces. This module never bypasses that.
 */
export async function loadMorningBrief(supabase: Supabase): Promise<MorningBriefData> {
  // Two sort keys: run_date picks the latest research day, created_at
  // breaks ties when that day has more than one frozen Core run (e.g. a
  // manual re-run) — without it, which run "latest" means is ambiguous
  // and non-deterministic.
  const { data: latestCoreRun } = await supabase
    .from("research_runs")
    .select("id, run_date")
    .eq("origin_type", "PMNTX_CORE")
    .not("frozen_at", "is", null)
    .order("run_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestCoreRun) {
    return { runDate: null, corePicks: [], agentPicks: [], selections: [], meta: [] };
  }

  const { data: coreRankings } = await supabase
    .from("candidate_rankings")
    .select("security_id, rank, score, direction")
    .eq("research_run_id", latestCoreRun.id)
    .eq("selected", true)
    .order("rank", { ascending: true });

  const securityIds = (coreRankings ?? []).map((r) => r.security_id);
  const { data: securities } = securityIds.length
    ? await supabase.from("securities").select("id, ticker, name").in("id", securityIds)
    : { data: [] };
  const securityById = new Map((securities ?? []).map((s) => [s.id, s]));

  const corePicks: CorePick[] = (coreRankings ?? []).map((r) => ({
    securityId: r.security_id,
    ticker: securityById.get(r.security_id)?.ticker ?? "?",
    name: securityById.get(r.security_id)?.name ?? "Unknown",
    rank: r.rank,
    score: Number(r.score),
    direction: r.direction ?? "WATCH",
  }));

  const { data: sameDayAgentRuns } = await supabase
    .from("research_runs")
    .select("id")
    .eq("run_date", latestCoreRun.run_date)
    .eq("origin_type", "AGENT")
    .not("frozen_at", "is", null);
  const agentResearchRunIds = (sameDayAgentRuns ?? []).map((r) => r.id);

  const { data: agentRuns } = agentResearchRunIds.length
    ? await supabase.from("agent_runs").select("id, agent_version_id, research_run_id").in("research_run_id", agentResearchRunIds)
    : { data: [] };

  const { data: agentVersions } = await supabase.from("agent_versions").select("id, agent_id");
  const { data: agents } = await supabase.from("agents").select("id, internal_name, display_name");
  const agentByVersionId = new Map(
    (agentVersions ?? []).map((v) => [v.id, (agents ?? []).find((a) => a.id === v.agent_id)])
  );

  const agentRunIds = (agentRuns ?? []).map((r) => r.id);
  const { data: listings } = agentRunIds.length
    ? await supabase
        .from("agent_daily_lists")
        .select("id, agent_run_id, security_id, direction, agent_score, thesis")
        .in("agent_run_id", agentRunIds)
        .not("frozen_at", "is", null)
    : { data: [] };

  const listingSecurityIds = [...new Set((listings ?? []).map((l) => l.security_id))];
  const { data: listingSecurities } = listingSecurityIds.length
    ? await supabase.from("securities").select("id, ticker").in("id", listingSecurityIds)
    : { data: [] };
  const tickerBySecurityId = new Map((listingSecurities ?? []).map((s) => [s.id, s.ticker]));

  const agentPicks: AgentPick[] = (listings ?? []).map((l) => {
    const agentRun = (agentRuns ?? []).find((r) => r.id === l.agent_run_id);
    const agent = agentRun ? agentByVersionId.get(agentRun.agent_version_id) : undefined;
    return {
      agentInternalName: agent?.internal_name ?? "UNKNOWN",
      agentDisplayName: agent?.display_name ?? "Unknown Agent",
      securityId: l.security_id,
      ticker: tickerBySecurityId.get(l.security_id) ?? "?",
      direction: l.direction,
      agentScore: l.agent_score,
      thesis: l.thesis,
    };
  });

  const listingIds = (listings ?? []).map((l) => l.id);
  const { data: rawSelections } = listingIds.length
    ? await supabase
        .from("pmntx_agent_selections")
        .select("agent_daily_list_id, approved, pmntx_secondary_score, pmntx_secondary_recommendation, evidence_discovered")
        .in("agent_daily_list_id", listingIds)
    : { data: [] };

  const selections: SelectionRow[] = (rawSelections ?? []).map((s) => {
    const listing = (listings ?? []).find((l) => l.id === s.agent_daily_list_id);
    const agentRun = listing ? (agentRuns ?? []).find((r) => r.id === listing.agent_run_id) : undefined;
    const agent = agentRun ? agentByVersionId.get(agentRun.agent_version_id) : undefined;
    return {
      agentDisplayName: agent?.display_name ?? "Unknown Agent",
      ticker: listing ? (tickerBySecurityId.get(listing.security_id) ?? "?") : "?",
      approved: s.approved,
      pmntxSecondaryScore: s.pmntx_secondary_score,
      pmntxSecondaryRecommendation: s.pmntx_secondary_recommendation,
      evidenceDiscovered: s.evidence_discovered,
    };
  });

  const { data: consensus } = await supabase
    .from("consensus_snapshots")
    .select("security_id, systems_count, direction_agreement, raw_consensus_score")
    .eq("run_date", latestCoreRun.run_date);

  const meta: MetaRow[] = (consensus ?? []).map((c) => ({
    ticker: securityById.get(c.security_id)?.ticker ?? tickerBySecurityId.get(c.security_id) ?? "?",
    systemsCount: c.systems_count,
    directionAgreement: (c.direction_agreement as Record<string, number>) ?? {},
    rawConsensusScore: c.raw_consensus_score,
  }));

  return { runDate: latestCoreRun.run_date, corePicks, agentPicks, selections, meta };
}
