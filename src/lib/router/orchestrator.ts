import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { getRemainingBudget } from "./budget";
import { loadRoutingTierConfig } from "./config";
import { decideRouting } from "./decide";
import type { RoutingDecision } from "./types";

/**
 * The seam that lets routeAndInvoke's INVOKE path call real deep-analysis
 * work without this module ever importing src/lib/ai/gateway.ts or the
 * blind-analysis/agent pipeline functions directly. In production, the
 * caller passes the real (unmodified) pipeline function; tests pass a
 * stub, so the vertical-slice test can exercise a genuine INVOKE decision
 * without ever touching the AI gateway.
 */
export type DeepAnalysisInvoker = (securityId: string, researchRunId: string | null) => Promise<void>;

export type RouteAndInvokeParams = {
  candidateRankingId: string | null;
  securityId: string;
  researchRunId: string | null;
  rank: number;
  confidence: number | null;
  disagreement: number | null;
  materialChangeFlag: boolean;
  lastAnalysisAt: string | null;
  tierCode: string;
};

/**
 * Decides whether a candidate's deep analysis is cost/relevance-justified
 * and, only on INVOKE, calls the provided invoker. A router_decisions row
 * is written for EVERY call, INVOKE or SKIP — the audit trail brief §16
 * asks for. Never calls the AI gateway or any pipeline function itself.
 */
export async function routeAndInvoke(params: RouteAndInvokeParams, invoker?: DeepAnalysisInvoker): Promise<RoutingDecision> {
  const supabase = createServiceRoleClient();
  const tier = await loadRoutingTierConfig(params.tierCode);

  if (!tier) {
    const decision: RoutingDecision = {
      decision: "SKIP",
      reasoning: `No routing_tier_configs row for tier ${params.tierCode}.`,
      tierCode: params.tierCode,
    };
    await recordDecision(supabase, params, decision, null, null);
    return decision;
  }

  const budget = await getRemainingBudget();
  const decision = decideRouting(
    {
      candidateRankingId: params.candidateRankingId,
      securityId: params.securityId,
      rank: params.rank,
      confidence: params.confidence,
      disagreement: params.disagreement,
      materialChangeFlag: params.materialChangeFlag,
      lastAnalysisAt: params.lastAnalysisAt,
      now: new Date().toISOString(),
      budgetRemainingDailyUsd: budget.dailyUsd,
      budgetRemainingMonthlyUsd: budget.monthlyUsd,
    },
    tier
  );

  await recordDecision(supabase, params, decision, budget.dailyUsd, budget.monthlyUsd);

  if (decision.decision === "INVOKE" && invoker) {
    await invoker(params.securityId, params.researchRunId);
  }

  return decision;
}

async function recordDecision(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: RouteAndInvokeParams,
  decision: RoutingDecision,
  budgetRemainingDailyUsd: number | null,
  budgetRemainingMonthlyUsd: number | null
): Promise<void> {
  const { error } = await supabase.from("router_decisions").insert({
    candidate_ranking_id: params.candidateRankingId,
    security_id: params.securityId,
    tier_code: params.tierCode,
    decision: decision.decision,
    reasoning: decision.reasoning,
    inputs_snapshot: {
      rank: params.rank,
      confidence: params.confidence,
      disagreement: params.disagreement,
      materialChangeFlag: params.materialChangeFlag,
      lastAnalysisAt: params.lastAnalysisAt,
    },
    budget_remaining_daily_usd: budgetRemainingDailyUsd,
    budget_remaining_monthly_usd: budgetRemainingMonthlyUsd,
  });
  // The audit trail must never fail silently — a swallowed error here
  // would mean a real INVOKE/SKIP decision went unrecorded.
  if (error) throw error;
}
