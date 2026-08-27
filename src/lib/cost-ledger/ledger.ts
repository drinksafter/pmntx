import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { CostBreakdownDimension, CostBreakdownRow, CostLedgerEntryInput } from "./types";

export async function recordCostEntry(input: CostLedgerEntryInput): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("cost_ledger_entries").insert({
    provider: input.provider,
    category: input.category,
    model_version_id: input.modelVersionId ?? null,
    agent_id: input.agentId ?? null,
    security_id: input.securityId ?? null,
    research_run_id: input.researchRunId ?? null,
    experiment_run_id: input.experimentRunId ?? null,
    prediction_id: input.predictionId ?? null,
    ai_execution_id: input.aiExecutionId ?? null,
    workflow_id: input.workflowId ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    actual_cost_usd: input.actualCostUsd ?? null,
    cost_date: input.costDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

/**
 * Idempotent pull-sync from the EXISTING ai_executions table (which
 * src/lib/ai/gateway.ts writes, untouched by this pivot) into the cost
 * ledger. Never a trigger on ai_executions — this reads it after the
 * fact. The partial unique index on ai_execution_id means re-running this
 * for the same executions upserts rather than duplicating cost.
 */
export async function syncAiExecutionsToCostLedger(sinceIso?: string): Promise<number> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("ai_executions")
    .select("id, ai_model_id, estimated_cost_usd, research_run_id, agent_id, security_id, workflow_id, executed_at, status")
    .eq("status", "SUCCEEDED");
  if (sinceIso) query = query.gte("executed_at", sinceIso);

  const { data: executions, error } = await query;
  if (error) throw error;
  if (!executions || executions.length === 0) return 0;

  const modelIds = [...new Set(executions.map((e) => e.ai_model_id))];
  const { data: models } = await supabase.from("ai_models").select("id, ai_provider_id").in("id", modelIds);
  const providerIdByModelId = new Map((models ?? []).map((m) => [m.id, m.ai_provider_id]));
  const providerIds = [...new Set([...providerIdByModelId.values()])];
  const { data: providers } = await supabase.from("ai_providers").select("id, code").in("id", providerIds);
  const providerCodeById = new Map((providers ?? []).map((p) => [p.id, p.code]));

  const { error: upsertError } = await supabase.from("cost_ledger_entries").upsert(
    executions.map((e) => ({
      ai_execution_id: e.id,
      provider: providerCodeById.get(providerIdByModelId.get(e.ai_model_id) ?? "") ?? "UNKNOWN",
      category: "AI_INFERENCE" as const,
      research_run_id: e.research_run_id,
      agent_id: e.agent_id,
      security_id: e.security_id,
      workflow_id: e.workflow_id,
      actual_cost_usd: e.estimated_cost_usd, // ai_executions.estimated_cost_usd is itself modeled from published pricing, not a provider invoice — see usage-queries.ts's own caveat; this is the ledger's best available "actual" figure until real invoice reconciliation exists
      cost_date: e.executed_at.slice(0, 10),
    })),
    { onConflict: "ai_execution_id" }
  );
  if (upsertError) throw upsertError;

  return executions.length;
}

export async function getDailyCostTotals(date: string): Promise<{ estimatedUsd: number; actualUsd: number }> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("cost_ledger_entries").select("estimated_cost_usd, actual_cost_usd").eq("cost_date", date);
  return {
    estimatedUsd: (data ?? []).reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0),
    actualUsd: (data ?? []).reduce((sum, r) => sum + Number(r.actual_cost_usd ?? 0), 0),
  };
}

export async function getMonthlyCostTotals(monthStartDate: string): Promise<{ estimatedUsd: number; actualUsd: number }> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("cost_ledger_entries").select("estimated_cost_usd, actual_cost_usd").gte("cost_date", monthStartDate);
  return {
    estimatedUsd: (data ?? []).reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0),
    actualUsd: (data ?? []).reduce((sum, r) => sum + Number(r.actual_cost_usd ?? 0), 0),
  };
}

export async function getCostBreakdown(dimension: CostBreakdownDimension): Promise<CostBreakdownRow[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from("cost_ledger_entries").select(`${dimension}, estimated_cost_usd, actual_cost_usd`);

  const byKey = new Map<string, CostBreakdownRow>();
  for (const row of data ?? []) {
    const key = String((row as Record<string, unknown>)[dimension] ?? "UNKNOWN");
    const entry = byKey.get(key) ?? { key, totalEstimatedUsd: 0, totalActualUsd: 0, entryCount: 0 };
    entry.totalEstimatedUsd += Number((row as { estimated_cost_usd?: number }).estimated_cost_usd ?? 0);
    entry.totalActualUsd += Number((row as { actual_cost_usd?: number }).actual_cost_usd ?? 0);
    entry.entryCount += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.totalActualUsd - a.totalActualUsd);
}
