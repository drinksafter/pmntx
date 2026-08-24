import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export type UsageSummary = {
  killSwitchEnabled: boolean;
  killSwitchReason: string | null;
  spendToday: number;
  spendThisMonth: number;
  requestsToday: number;
  failedRequestsToday: number;
  retriesToday: number;
  tokensInputToday: number;
  tokensOutputToday: number;
  limits: {
    maxCostPerDayUsd: number | null;
    maxCostPerMonthUsd: number | null;
  };
  byProvider: { providerCode: string; modelCode: string; cost: number; requests: number }[];
  recentEvents: {
    id: string;
    eventType: string;
    roleCode: string | null;
    detail: unknown;
    createdAt: string;
  }[];
};

/** Read-only aggregates for Admin -> System -> Usage. All spend figures are the sum of ai_executions.estimated_cost_usd — modeled from provider-published per-token pricing, not the provider's actual invoice. */
export async function loadUsageSummary(): Promise<UsageSummary> {
  const supabase = createServiceRoleClient();
  const todaySince = startOfTodayIso();
  const monthSince = startOfMonthIso();

  const [{ data: controls }, { data: limits }, { data: todayExecutions }, { data: monthExecutions }, { data: events }] =
    await Promise.all([
      supabase.from("ai_system_controls").select("paid_ai_disabled, disabled_reason").eq("id", true).single(),
      supabase
        .from("ai_budget_limits")
        .select("max_cost_per_day_usd, max_cost_per_month_usd")
        .eq("scope", "GLOBAL")
        .is("agent_id", null)
        .single(),
      supabase
        .from("ai_executions")
        .select("estimated_cost_usd, status, retries, tokens_input, tokens_output, ai_model_id")
        .gte("executed_at", todaySince),
      supabase.from("ai_executions").select("estimated_cost_usd").eq("status", "SUCCEEDED").gte("executed_at", monthSince),
      supabase
        .from("ai_budget_events")
        .select("id, event_type, role_code, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const { data: models } = await supabase.from("ai_models").select("id, model_code, ai_provider_id");
  const { data: providers } = await supabase.from("ai_providers").select("id, code");
  const providerCodeById = new Map((providers ?? []).map((p) => [p.id, p.code]));
  const modelById = new Map((models ?? []).map((m) => [m.id, m]));

  const byProviderMap = new Map<string, { providerCode: string; modelCode: string; cost: number; requests: number }>();
  for (const row of todayExecutions ?? []) {
    const model = modelById.get(row.ai_model_id);
    const providerCode = model ? (providerCodeById.get(model.ai_provider_id) ?? "UNKNOWN") : "UNKNOWN";
    const modelCode = model?.model_code ?? "unknown";
    const key = `${providerCode}:${modelCode}`;
    const entry = byProviderMap.get(key) ?? { providerCode, modelCode, cost: 0, requests: 0 };
    if (row.status === "SUCCEEDED") entry.cost += Number(row.estimated_cost_usd ?? 0);
    entry.requests += 1;
    byProviderMap.set(key, entry);
  }

  return {
    killSwitchEnabled: controls?.paid_ai_disabled ?? false,
    killSwitchReason: controls?.disabled_reason ?? null,
    spendToday: (todayExecutions ?? [])
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0),
    spendThisMonth: (monthExecutions ?? []).reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0),
    requestsToday: (todayExecutions ?? []).length,
    failedRequestsToday: (todayExecutions ?? []).filter((r) => r.status === "FAILED").length,
    retriesToday: (todayExecutions ?? []).reduce((sum, r) => sum + (r.retries ?? 0), 0),
    tokensInputToday: (todayExecutions ?? []).reduce((sum, r) => sum + (r.tokens_input ?? 0), 0),
    tokensOutputToday: (todayExecutions ?? []).reduce((sum, r) => sum + (r.tokens_output ?? 0), 0),
    limits: {
      maxCostPerDayUsd: limits?.max_cost_per_day_usd ?? null,
      maxCostPerMonthUsd: limits?.max_cost_per_month_usd ?? null,
    },
    byProvider: [...byProviderMap.values()].sort((a, b) => b.cost - a.cost),
    recentEvents: (events ?? []).map((e) => ({
      id: e.id,
      eventType: e.event_type,
      roleCode: e.role_code,
      detail: e.detail,
      createdAt: e.created_at,
    })),
  };
}

export type BudgetLimitsRow = {
  max_cost_per_run_usd: number | null;
  max_cost_per_day_usd: number | null;
  max_cost_per_month_usd: number | null;
  max_cost_per_agent_per_day_usd: number | null;
  max_cost_per_security_analysis_usd: number | null;
  max_requests_per_workflow: number | null;
  max_requests_per_security: number | null;
  max_input_tokens_per_request: number | null;
  max_output_tokens_per_request: number | null;
  max_total_tokens_per_workflow: number | null;
  max_retries_per_request: number;
  max_reasoning_rounds: number | null;
  max_execution_time_seconds: number | null;
};

export async function loadGlobalBudgetLimits(): Promise<BudgetLimitsRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("ai_budget_limits")
    .select(
      "max_cost_per_run_usd, max_cost_per_day_usd, max_cost_per_month_usd, max_cost_per_agent_per_day_usd, max_cost_per_security_analysis_usd, max_requests_per_workflow, max_requests_per_security, max_input_tokens_per_request, max_output_tokens_per_request, max_total_tokens_per_workflow, max_retries_per_request, max_reasoning_rounds, max_execution_time_seconds"
    )
    .eq("scope", "GLOBAL")
    .is("agent_id", null)
    .single();
  return data;
}
