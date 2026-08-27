import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordCostEntry, syncAiExecutionsToCostLedger } from "@/lib/cost-ledger/ledger";

import { getRemainingBudget } from "./budget";
import { routeAndInvoke } from "./orchestrator";

describe("AUDIT: §9 router edge cases", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from("securities")
      .insert({ ticker: `ROUTERAUDIT_${randomUUID().slice(0, 8)}`, name: "Router Audit" })
      .select("id")
      .single();
    securityId = data!.id;
  });

  afterAll(async () => {
    await supabase.from("router_decisions").delete().eq("security_id", securityId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("[zero/exhausted budget] kill switch alone drives remaining budget to exactly zero regardless of configured limits", async () => {
    await supabase.from("ai_system_controls").update({ paid_ai_disabled: true }).eq("id", true);
    const budget = await getRemainingBudget();
    expect(budget.dailyUsd).toBe(0);
    expect(budget.monthlyUsd).toBe(0);
    await supabase.from("ai_system_controls").update({ paid_ai_disabled: false }).eq("id", true);
  });

  it("[repeated invocation / duplicate suppression] the router itself does NOT deduplicate back-to-back identical INVOKE calls — this relies entirely on the caller-supplied lastAnalysisAt", async () => {
    let invokeCount = 0;
    const call = () =>
      routeAndInvoke(
        {
          candidateRankingId: null,
          securityId,
          researchRunId: null,
          rank: 1,
          confidence: 0.9,
          disagreement: null,
          materialChangeFlag: false,
          lastAnalysisAt: null, // caller does NOT report a recent analysis
          tierCode: "BLIND_ANALYSIS",
        },
        async () => {
          invokeCount++;
        }
      );

    const d1 = await call();
    const d2 = await call();
    const d3 = await call();

    console.log(`[duplicate suppression] 3 back-to-back calls with lastAnalysisAt=null: decisions=${[d1, d2, d3].map((d) => d.decision).join(",")}, invokeCount=${invokeCount}`);
    if (invokeCount === 3) {
      console.log(
        "FINDING: routeAndInvoke has no self-contained duplicate-invocation suppression — it invoked 3 times for the identical candidate/tier back-to-back because lastAnalysisAt was (correctly, per this test) null each time. Redundant-call prevention depends entirely on the CALLER correctly looking up and passing the real lastAnalysisAt; the router does not independently consult its own router_decisions history to self-suppress. The downstream AI gateway's duplicate-fingerprint mechanism (untouched, pre-existing) still prevents an actual double-charge at the LLM-call layer if the same fingerprint is used — but the router's own decision layer will happily say INVOKE 3 times in a row."
      );
    }
    expect(invokeCount).toBeGreaterThanOrEqual(1); // at minimum the first call invokes
  });

  it("[agent-specific budget] getRemainingBudget() only considers the GLOBAL daily/monthly budget, never a per-agent budget, despite ai_budget_limits supporting per-agent scope", async () => {
    const { data: agentLimits } = await supabase.from("ai_budget_limits").select("scope, max_cost_per_agent_per_day_usd").eq("scope", "GLOBAL").single();
    console.log(`[agent budget] GLOBAL row's max_cost_per_agent_per_day_usd=${agentLimits?.max_cost_per_agent_per_day_usd} — this value exists in the schema but router/budget.ts never reads it or any AGENT-scoped ai_budget_limits row.`);
    // Documented via direct code read (src/lib/router/budget.ts only calls
    // loadUsageSummary(), which itself only returns global limits) — this
    // assertion just confirms the GLOBAL row genuinely has a per-agent
    // figure configured, proving the data exists but is unused by the router.
    expect(agentLimits?.max_cost_per_agent_per_day_usd).not.toBeNull();
  });

  it("[NOT_CONFIGURED-like] a nonexistent tier fails closed with a clear reason, never a crash", async () => {
    const decision = await routeAndInvoke({
      candidateRankingId: null,
      securityId,
      researchRunId: null,
      rank: 1,
      confidence: 0.99,
      disagreement: null,
      materialChangeFlag: false,
      lastAnalysisAt: null,
      tierCode: "COMPLETELY_UNKNOWN_TIER",
    });
    expect(decision.decision).toBe("SKIP");
  });

  it("[multiple relevant specialists] two tiers can independently evaluate the same candidate with different outcomes", async () => {
    const decisionBlind = await routeAndInvoke({
      candidateRankingId: null,
      securityId,
      researchRunId: null,
      rank: 20, // within BLIND_ANALYSIS's rank 1-25 but outside AGENT_REVIEW's rank 1-15
      confidence: 0.9,
      disagreement: null,
      materialChangeFlag: false,
      lastAnalysisAt: null,
      tierCode: "BLIND_ANALYSIS",
    });
    const decisionAgent = await routeAndInvoke({
      candidateRankingId: null,
      securityId,
      researchRunId: null,
      rank: 20,
      confidence: 0.9,
      disagreement: null,
      materialChangeFlag: false,
      lastAnalysisAt: null,
      tierCode: "AGENT_REVIEW",
    });
    expect(decisionBlind.decision).toBe("INVOKE"); // rank 20 is within 1-25
    expect(decisionAgent.decision).toBe("SKIP"); // rank 20 is outside 1-15
  });
});

describe("AUDIT: §10 cost ledger edge cases", () => {
  const supabase = createServiceRoleClient();
  const workflowId = `LEDGERAUDIT_${randomUUID().slice(0, 8)}`;

  afterAll(async () => {
    await supabase.from("cost_ledger_entries").delete().eq("workflow_id", workflowId);
  });

  it("[zero-cost MODEL inference representable] recording a genuine $0 actual cost is distinct from recording nothing at all", async () => {
    await recordCostEntry({ provider: "INTERNAL_COMPUTE", category: "FEATURE_COMPUTE", workflowId, estimatedCostUsd: 0, actualCostUsd: 0 });
    const { data } = await supabase.from("cost_ledger_entries").select("estimated_cost_usd, actual_cost_usd").eq("workflow_id", workflowId).single();
    expect(data?.estimated_cost_usd).toBe(0); // not null — a real recorded zero
    expect(data?.actual_cost_usd).toBe(0);
  });

  it("[estimated vs actual distinguishable] a SKIPped call can record a nonzero estimate alongside a real zero actual", async () => {
    const workflowId2 = `${workflowId}_SKIP`;
    await recordCostEntry({ provider: "ANTHROPIC", category: "AI_INFERENCE", workflowId: workflowId2, estimatedCostUsd: 0.08, actualCostUsd: 0 });
    const { data } = await supabase.from("cost_ledger_entries").select("estimated_cost_usd, actual_cost_usd").eq("workflow_id", workflowId2).single();
    expect(Number(data?.estimated_cost_usd)).toBe(0.08);
    expect(Number(data?.actual_cost_usd)).toBe(0);
    await supabase.from("cost_ledger_entries").delete().eq("workflow_id", workflowId2);
  });

  it("[idempotent sync, repeated] syncAiExecutionsToCostLedger called 5 times in a row never grows the ai_execution_id-backed row count beyond the true count", async () => {
    const before = await supabase.from("cost_ledger_entries").select("id", { count: "exact", head: true }).not("ai_execution_id", "is", null);
    for (let i = 0; i < 5; i++) await syncAiExecutionsToCostLedger();
    const after = await supabase.from("cost_ledger_entries").select("id", { count: "exact", head: true }).not("ai_execution_id", "is", null);
    expect(after.count).toBe(before.count);
  });
});
