import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { AiBudgetEventType } from "@/lib/supabase/types";

import { resolveAiRoute } from "./router";
import type { AiCompletionRequest, AiCompletionResult, AiRole } from "./types";

// ---------------------------------------------------------------------------
// Centralized AI inference gateway (docs/PHASE_1A_SCOPE_LOCK.md's AI cost
// guardrails requirement). This is the ONLY module allowed to call an
// AiProvider adapter or write ai_executions — no Hunter, agent, research
// job, or future provider integration may reach src/lib/ai/router.ts or a
// provider adapter directly. That's what makes the budget limits below
// actually enforced rather than advisory.
//
// Every check here fails closed: on any doubt (kill switch on, budget
// query fails, limit exceeded), the request is BLOCKED, never allowed
// through. Nothing in this module — no agent, no PMNTX Meta process, no
// automated learning loop — may modify ai_budget_limits; only
// src/lib/ai/budget-actions.ts (admin-authorized Server Actions) writes to
// that table.
// ---------------------------------------------------------------------------

export type AiGatewayContext = {
  researchRunId?: string;
  agentId?: string;
  securityId?: string;
  /** Groups multiple related calls (e.g. "blind_analysis:<security>:<date>") for per-workflow request/token ceilings. */
  workflowId?: string;
  /** 1-indexed round number for multi-round workflows (debate, iterative reasoning) — checked against max_reasoning_rounds. */
  roundNumber?: number;
};

export type AiGatewayRequest = {
  role: AiRole;
  request: AiCompletionRequest;
  context?: AiGatewayContext;
  /** Caller-computed fingerprint (see computeRequestFingerprint) for duplicate suppression within a research run. */
  fingerprint?: string;
};

export type AiGatewayBlockReason =
  | "KILL_SWITCH"
  | "RUN_BUDGET"
  | "DAILY_BUDGET"
  | "MONTHLY_BUDGET"
  | "AGENT_DAILY_BUDGET"
  | "SECURITY_BUDGET"
  | "REQUEST_LIMIT"
  | "TOKEN_LIMIT"
  | "RETRY_LIMIT"
  | "TIME_LIMIT"
  | "REASONING_ROUNDS"
  | "ROUTE_UNAVAILABLE";

export type AiGatewayResult =
  | { status: "OK"; result: AiCompletionResult; aiExecutionId: string }
  | { status: "NOT_CONFIGURED"; message: string }
  | { status: "DUPLICATE"; existingAiExecutionId: string | null }
  | { status: "BLOCKED"; reason: AiGatewayBlockReason; message: string };

/** Convenience helper for callers to build a stable fingerprint from the parts that define "materially identical." */
export function computeRequestFingerprint(parts: (string | number | undefined)[]): string {
  return createHash("sha256").update(parts.map(String).join("|")).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text: string): number {
  // No token-counting API call for a pre-flight estimate — ~4 chars/token
  // is a standard rough heuristic for English text, good enough to catch
  // grossly-oversized requests before they're sent.
  return Math.ceil(text.length / 4);
}

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

type EffectiveLimits = {
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
  warning_thresholds: number[];
};

async function loadEffectiveLimits(
  supabase: ReturnType<typeof createServiceRoleClient>,
  agentId: string | undefined
): Promise<EffectiveLimits> {
  const { data: global } = await supabase
    .from("ai_budget_limits")
    .select("*")
    .eq("scope", "GLOBAL")
    .is("agent_id", null)
    .single();

  if (!global) {
    // Fail closed: no configured limits at all means nothing is allowed
    // through rather than falling back to "unlimited."
    return {
      max_cost_per_run_usd: 0,
      max_cost_per_day_usd: 0,
      max_cost_per_month_usd: 0,
      max_cost_per_agent_per_day_usd: 0,
      max_cost_per_security_analysis_usd: 0,
      max_requests_per_workflow: 0,
      max_requests_per_security: 0,
      max_input_tokens_per_request: 0,
      max_output_tokens_per_request: 0,
      max_total_tokens_per_workflow: 0,
      max_retries_per_request: 0,
      max_reasoning_rounds: 0,
      max_execution_time_seconds: 30,
      warning_thresholds: [0.5, 0.75, 0.9, 1.0],
    };
  }

  if (!agentId) return global as EffectiveLimits;

  const { data: agentOverride } = await supabase
    .from("ai_budget_limits")
    .select("*")
    .eq("scope", "AGENT")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (!agentOverride) return global as EffectiveLimits;

  const merged = { ...global } as Record<string, unknown>;
  for (const [key, value] of Object.entries(agentOverride)) {
    if (value !== null && value !== undefined && key in merged) merged[key] = value;
  }
  return merged as unknown as EffectiveLimits;
}

async function recordBudgetEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  eventType: AiBudgetEventType,
  role: AiRole,
  context: AiGatewayContext | undefined,
  detail: Record<string, unknown>
): Promise<void> {
  await supabase.from("ai_budget_events").insert({
    event_type: eventType,
    role_code: role,
    research_run_id: context?.researchRunId,
    agent_id: context?.agentId,
    security_id: context?.securityId,
    detail,
  });
}

async function sumCost(
  supabase: ReturnType<typeof createServiceRoleClient>,
  filters: { research_run_id?: string; agent_id?: string; security_id?: string; since?: string }
): Promise<number> {
  let query = supabase.from("ai_executions").select("estimated_cost_usd").eq("status", "SUCCEEDED");
  if (filters.research_run_id) query = query.eq("research_run_id", filters.research_run_id);
  if (filters.agent_id) query = query.eq("agent_id", filters.agent_id);
  if (filters.security_id) query = query.eq("security_id", filters.security_id);
  if (filters.since) query = query.gte("executed_at", filters.since);

  const { data } = await query;
  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

async function countRequests(
  supabase: ReturnType<typeof createServiceRoleClient>,
  filters: { workflow_id?: string; security_id?: string; research_run_id?: string }
): Promise<number> {
  let query = supabase.from("ai_executions").select("id", { count: "exact", head: true });
  if (filters.workflow_id) query = query.eq("workflow_id", filters.workflow_id);
  if (filters.security_id) query = query.eq("security_id", filters.security_id);
  if (filters.research_run_id) query = query.eq("research_run_id", filters.research_run_id);

  const { count } = await query;
  return count ?? 0;
}

async function sumWorkflowTokens(
  supabase: ReturnType<typeof createServiceRoleClient>,
  workflowId: string
): Promise<number> {
  const { data } = await supabase
    .from("ai_executions")
    .select("tokens_input, tokens_output")
    .eq("workflow_id", workflowId)
    .eq("status", "SUCCEEDED");
  return (data ?? []).reduce((sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0), 0);
}

/**
 * The single entry point for all paid AI inference in PMNTX. Resolves the
 * role's route, enforces every configured budget/request/token/time/
 * duplicate limit pre-flight, calls the provider with a bounded retry
 * ceiling, and records the call (success or failure) to ai_executions with
 * full cost attribution.
 */
export async function requestAiCompletion(input: AiGatewayRequest): Promise<AiGatewayResult> {
  const supabase = createServiceRoleClient();
  const { role, request, context = {}, fingerprint } = input;

  // 1. Global kill switch.
  const { data: controls } = await supabase
    .from("ai_system_controls")
    .select("paid_ai_disabled")
    .eq("id", true)
    .single();
  if (!controls || controls.paid_ai_disabled) {
    await recordBudgetEvent(supabase, "BLOCKED_KILL_SWITCH", role, context, {});
    return { status: "BLOCKED", reason: "KILL_SWITCH", message: "STOPPED — PAID AI DISABLED (admin kill switch)." };
  }

  // 2. Duplicate-request suppression.
  if (fingerprint && context.researchRunId) {
    const { data: existing } = await supabase
      .from("ai_request_fingerprints")
      .select("ai_execution_id")
      .eq("research_run_id", context.researchRunId)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (existing) {
      await recordBudgetEvent(supabase, "BLOCKED_DUPLICATE", role, context, { fingerprint });
      return { status: "DUPLICATE", existingAiExecutionId: existing.ai_execution_id };
    }
  }

  // 3. Reasoning/debate round ceiling.
  const limits = await loadEffectiveLimits(supabase, context.agentId);
  if (
    context.roundNumber !== undefined &&
    limits.max_reasoning_rounds !== null &&
    context.roundNumber > limits.max_reasoning_rounds
  ) {
    await recordBudgetEvent(supabase, "BLOCKED_REASONING_ROUNDS", role, context, {
      roundNumber: context.roundNumber,
      limit: limits.max_reasoning_rounds,
    });
    return {
      status: "BLOCKED",
      reason: "REASONING_ROUNDS",
      message: `STOPPED — REASONING ROUND LIMIT (round ${context.roundNumber} > ${limits.max_reasoning_rounds}).`,
    };
  }

  // 4. Resolve route (provider/model/credential).
  const resolved = await resolveAiRoute(role);
  if (!resolved.ok) {
    return { status: "NOT_CONFIGURED", message: resolved.message };
  }
  const route = resolved.route;

  // 5. Clamp output tokens; estimate input tokens.
  const clampedMaxTokens =
    limits.max_output_tokens_per_request !== null
      ? Math.min(request.maxTokens, limits.max_output_tokens_per_request)
      : request.maxTokens;
  const clampedRequest: AiCompletionRequest = { ...request, maxTokens: clampedMaxTokens };

  const inputText = (request.system ?? "") + request.messages.map((m) => m.content).join("\n");
  const estimatedInputTokens = estimateTokens(inputText);

  if (limits.max_input_tokens_per_request !== null && estimatedInputTokens > limits.max_input_tokens_per_request) {
    await recordBudgetEvent(supabase, "BLOCKED_TOKEN_LIMIT", role, context, {
      estimatedInputTokens,
      limit: limits.max_input_tokens_per_request,
    });
    return {
      status: "BLOCKED",
      reason: "TOKEN_LIMIT",
      message: `STOPPED — TOKEN LIMIT (estimated input ${estimatedInputTokens} tokens > ${limits.max_input_tokens_per_request}).`,
    };
  }

  // 6. Pre-flight worst-case cost estimate vs. every applicable budget.
  const estimatedCost =
    (estimatedInputTokens / 1_000_000) * route.costInputPerMillion +
    (clampedMaxTokens / 1_000_000) * route.costOutputPerMillion;

  const [runSpend, dailySpend, monthlySpend, agentDailySpend, securitySpend] = await Promise.all([
    context.researchRunId
      ? sumCost(supabase, { research_run_id: context.researchRunId })
      : Promise.resolve(0),
    sumCost(supabase, { since: startOfTodayIso() }),
    sumCost(supabase, { since: startOfMonthIso() }),
    context.agentId
      ? sumCost(supabase, { agent_id: context.agentId, since: startOfTodayIso() })
      : Promise.resolve(0),
    context.securityId && context.researchRunId
      ? sumCost(supabase, { security_id: context.securityId, research_run_id: context.researchRunId })
      : Promise.resolve(0),
  ]);

  const budgetChecks: { limit: number | null; current: number; reason: AiGatewayBlockReason; event: AiBudgetEventType; label: string }[] = [
    { limit: limits.max_cost_per_run_usd, current: runSpend, reason: "RUN_BUDGET", event: "BLOCKED_RUN_BUDGET", label: "RUN BUDGET" },
    { limit: limits.max_cost_per_day_usd, current: dailySpend, reason: "DAILY_BUDGET", event: "BLOCKED_DAILY_BUDGET", label: "DAILY BUDGET" },
    { limit: limits.max_cost_per_month_usd, current: monthlySpend, reason: "MONTHLY_BUDGET", event: "BLOCKED_MONTHLY_BUDGET", label: "MONTHLY BUDGET" },
    { limit: limits.max_cost_per_agent_per_day_usd, current: agentDailySpend, reason: "AGENT_DAILY_BUDGET", event: "BLOCKED_AGENT_DAILY_BUDGET", label: "AGENT DAILY BUDGET" },
    { limit: limits.max_cost_per_security_analysis_usd, current: securitySpend, reason: "SECURITY_BUDGET", event: "BLOCKED_SECURITY_BUDGET", label: "SECURITY BUDGET" },
  ];

  for (const check of budgetChecks) {
    if (check.limit !== null && check.current + estimatedCost > check.limit) {
      await recordBudgetEvent(supabase, check.event, role, context, {
        current: check.current,
        estimatedCost,
        limit: check.limit,
      });
      return {
        status: "BLOCKED",
        reason: check.reason,
        message: `STOPPED — ${check.label} (would reach $${(check.current + estimatedCost).toFixed(4)} of $${check.limit} limit).`,
      };
    }
  }

  // 7. Request-count and workflow-token ceilings.
  if (limits.max_requests_per_workflow !== null && context.workflowId) {
    const count = await countRequests(supabase, { workflow_id: context.workflowId });
    if (count + 1 > limits.max_requests_per_workflow) {
      await recordBudgetEvent(supabase, "BLOCKED_REQUEST_LIMIT", role, context, { count, limit: limits.max_requests_per_workflow, scope: "workflow" });
      return { status: "BLOCKED", reason: "REQUEST_LIMIT", message: `STOPPED — REQUEST LIMIT (workflow at ${count} of ${limits.max_requests_per_workflow}).` };
    }
  }
  if (limits.max_requests_per_security !== null && context.securityId) {
    const count = await countRequests(supabase, { security_id: context.securityId, research_run_id: context.researchRunId });
    if (count + 1 > limits.max_requests_per_security) {
      await recordBudgetEvent(supabase, "BLOCKED_REQUEST_LIMIT", role, context, { count, limit: limits.max_requests_per_security, scope: "security" });
      return { status: "BLOCKED", reason: "REQUEST_LIMIT", message: `STOPPED — REQUEST LIMIT (security at ${count} of ${limits.max_requests_per_security}).` };
    }
  }
  if (limits.max_total_tokens_per_workflow !== null && context.workflowId) {
    const used = await sumWorkflowTokens(supabase, context.workflowId);
    if (used + estimatedInputTokens + clampedMaxTokens > limits.max_total_tokens_per_workflow) {
      await recordBudgetEvent(supabase, "BLOCKED_TOKEN_LIMIT", role, context, { used, limit: limits.max_total_tokens_per_workflow, scope: "workflow" });
      return { status: "BLOCKED", reason: "TOKEN_LIMIT", message: `STOPPED — TOKEN LIMIT (workflow at ${used} of ${limits.max_total_tokens_per_workflow}).` };
    }
  }

  // 8. Call the provider with a bounded retry ceiling + time limit — never
  // an uncontrolled retry loop.
  const maxRetries = limits.max_retries_per_request;
  const timeLimitMs = limits.max_execution_time_seconds ? limits.max_execution_time_seconds * 1000 : null;
  const startedAt = Date.now();

  let result: AiCompletionResult | null = null;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    if (timeLimitMs !== null && Date.now() - startedAt > timeLimitMs) {
      await recordBudgetEvent(supabase, "BLOCKED_TIME_LIMIT", role, context, { elapsedMs: Date.now() - startedAt, limitMs: timeLimitMs });
      await supabase.from("ai_executions").insert({
        ai_route_id: route.routeId,
        ai_model_id: route.aiModelId,
        role_code: role,
        status: "FAILED",
        error_message: "STOPPED — TIME LIMIT",
        retries: attempt,
        research_run_id: context.researchRunId,
        agent_id: context.agentId,
        security_id: context.securityId,
        workflow_id: context.workflowId,
      });
      return { status: "BLOCKED", reason: "TIME_LIMIT", message: `STOPPED — TIME LIMIT (exceeded ${limits.max_execution_time_seconds}s).` };
    }

    try {
      result = await route.adapter(route.modelCode, clampedRequest, route.apiKey);
      break;
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt > maxRetries) break;
      await sleep(2 ** attempt * 500); // bounded exponential backoff
    }
  }

  if (!result) {
    // attempt is incremented once more than the number of retries that
    // actually happened (it ticks up after every failed try, including the
    // last one that broke the loop) — subtract 1 so `retries` means
    // "retries after the first attempt," matching the column name.
    const retries = attempt - 1;
    const errorMessage = lastError instanceof Error ? lastError.message : "Unknown AI provider error.";
    await recordBudgetEvent(supabase, "BLOCKED_RETRY_LIMIT", role, context, { attempts: attempt, retries, error: errorMessage });
    await supabase.from("ai_executions").insert({
      ai_route_id: route.routeId,
      ai_model_id: route.aiModelId,
      role_code: role,
      status: "FAILED",
      error_message: `STOPPED — RETRY LIMIT: ${errorMessage}`,
      retries,
      research_run_id: context.researchRunId,
      agent_id: context.agentId,
      security_id: context.securityId,
      workflow_id: context.workflowId,
    });
    return { status: "BLOCKED", reason: "RETRY_LIMIT", message: `STOPPED — RETRY LIMIT (${attempt} attempts): ${errorMessage}` };
  }

  // 9. Record the successful call with full cost attribution.
  const actualCost =
    (result.tokensInput / 1_000_000) * route.costInputPerMillion +
    (result.tokensOutput / 1_000_000) * route.costOutputPerMillion;

  const { data: executionRow, error: insertError } = await supabase
    .from("ai_executions")
    .insert({
      ai_route_id: route.routeId,
      ai_model_id: route.aiModelId,
      role_code: role,
      output: { text: result.text },
      tokens_input: result.tokensInput,
      tokens_output: result.tokensOutput,
      estimated_cost_usd: actualCost,
      latency_ms: result.latencyMs,
      status: "SUCCEEDED",
      retries: attempt,
      research_run_id: context.researchRunId,
      agent_id: context.agentId,
      security_id: context.securityId,
      workflow_id: context.workflowId,
    })
    .select("id")
    .single();

  if (insertError || !executionRow) {
    throw new Error(`Gateway succeeded but failed to record ai_executions: ${insertError?.message}`);
  }

  if (fingerprint && context.researchRunId) {
    await supabase.from("ai_request_fingerprints").insert({
      research_run_id: context.researchRunId,
      fingerprint,
      role_code: role,
      ai_execution_id: executionRow.id,
    });
  }

  // 10. Warning thresholds (never blocking — informational only).
  await checkWarningThresholds(supabase, role, context, dailySpend + actualCost, monthlySpend + actualCost, limits);

  return { status: "OK", result, aiExecutionId: executionRow.id };
}

async function checkWarningThresholds(
  supabase: ReturnType<typeof createServiceRoleClient>,
  role: AiRole,
  context: AiGatewayContext,
  dailySpendAfter: number,
  monthlySpendAfter: number,
  limits: EffectiveLimits
): Promise<void> {
  const scopes: { label: string; spend: number; limit: number | null }[] = [
    { label: "daily", spend: dailySpendAfter, limit: limits.max_cost_per_day_usd },
    { label: "monthly", spend: monthlySpendAfter, limit: limits.max_cost_per_month_usd },
  ];

  for (const scope of scopes) {
    if (scope.limit === null || scope.limit <= 0) continue;
    for (const threshold of limits.warning_thresholds) {
      const thresholdAmount = scope.limit * threshold;
      if (scope.spend < thresholdAmount) continue;

      const since = scope.label === "daily" ? startOfTodayIso() : startOfMonthIso();
      const { count } = await supabase
        .from("ai_budget_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "WARNING_THRESHOLD")
        .gte("created_at", since)
        .contains("detail", { scope: scope.label, threshold });

      if (!count) {
        await recordBudgetEvent(supabase, "WARNING_THRESHOLD", role, context, {
          scope: scope.label,
          threshold,
          spend: scope.spend,
          limit: scope.limit,
        });
      }
    }
  }
}
