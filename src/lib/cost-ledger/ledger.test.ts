import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { getCostBreakdown, getDailyCostTotals, recordCostEntry, syncAiExecutionsToCostLedger } from "./ledger";

describe("cost-ledger/ledger", () => {
  const supabase = createServiceRoleClient();
  const workflowId = `LEDGERTEST_${randomUUID().slice(0, 8)}`;
  const costDate = "2026-03-01";

  afterAll(async () => {
    await supabase.from("cost_ledger_entries").delete().eq("workflow_id", workflowId);
  });

  it("[property #13] aggregates correctly by day", async () => {
    await recordCostEntry({ provider: "OPENAI", category: "AI_INFERENCE", workflowId, estimatedCostUsd: 0.1, actualCostUsd: 0.12, costDate });
    await recordCostEntry({ provider: "ANTHROPIC", category: "AI_INFERENCE", workflowId, estimatedCostUsd: 0.2, actualCostUsd: 0.18, costDate });
    await recordCostEntry({ provider: "INTERNAL_COMPUTE", category: "FEATURE_COMPUTE", workflowId, estimatedCostUsd: 0, actualCostUsd: 0, costDate });

    const totals = await getDailyCostTotals(costDate);
    // Other tests/runs may also write entries dated costDate — assert the
    // totals are AT LEAST what this test contributed, not an exact equal,
    // to avoid being fragile against test-suite ordering.
    expect(totals.estimatedUsd).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(totals.actualUsd).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });

  it("breaks down cost by provider", async () => {
    const breakdown = await getCostBreakdown("provider");
    const openaiRow = breakdown.find((r) => r.key === "OPENAI");
    const anthropicRow = breakdown.find((r) => r.key === "ANTHROPIC");
    expect(openaiRow?.totalActualUsd).toBeGreaterThanOrEqual(0.12 - 1e-9);
    expect(anthropicRow?.totalActualUsd).toBeGreaterThanOrEqual(0.18 - 1e-9);
  });

  it("syncAiExecutionsToCostLedger is idempotent — running it twice doesn't double-count", async () => {
    // No real ai_executions rows are created by this suite (no paid calls
    // anywhere in this repo's tests) — this exercises the idempotency
    // property itself: two syncs in a row produce the same ledger count
    // for ai_execution_id-backed rows, never a growing duplicate count.
    const before = await supabase.from("cost_ledger_entries").select("id", { count: "exact", head: true }).not("ai_execution_id", "is", null);
    await syncAiExecutionsToCostLedger();
    await syncAiExecutionsToCostLedger();
    const after = await supabase.from("cost_ledger_entries").select("id", { count: "exact", head: true }).not("ai_execution_id", "is", null);
    expect(after.count).toBe(before.count);
  });
});
