import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { routeAndInvoke } from "./orchestrator";

describe("router/orchestrator (DB)", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from("securities")
      .insert({ ticker: `ROUTERTEST_${randomUUID().slice(0, 8)}`, name: "Router Test Security" })
      .select("id")
      .single();
    securityId = data!.id;
  });

  afterAll(async () => {
    await supabase.from("router_decisions").delete().eq("security_id", securityId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("writes a router_decisions row for a SKIP (low rank), and never calls the invoker", async () => {
    let invoked = false;
    const decision = await routeAndInvoke(
      {
        candidateRankingId: null,
        securityId,
        researchRunId: null,
        rank: 999,
        confidence: 0.9,
        disagreement: null,
        materialChangeFlag: false,
        lastAnalysisAt: null,
        tierCode: "BLIND_ANALYSIS",
      },
      async () => {
        invoked = true;
      }
    );

    expect(decision.decision).toBe("SKIP");
    expect(invoked).toBe(false);

    const { data: rows } = await supabase
      .from("router_decisions")
      .select("decision, tier_code, reasoning")
      .eq("security_id", securityId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(rows?.[0].decision).toBe("SKIP");
    expect(rows?.[0].tier_code).toBe("BLIND_ANALYSIS");
  });

  it("[property #7] invokes the provided DeepAnalysisInvoker on INVOKE, and records it", async () => {
    let invokedSecurityId: string | null = null;
    const decision = await routeAndInvoke(
      {
        candidateRankingId: null,
        securityId,
        researchRunId: null,
        rank: 3,
        confidence: 0.9,
        disagreement: null,
        materialChangeFlag: false,
        lastAnalysisAt: null,
        tierCode: "BLIND_ANALYSIS",
      },
      async (secId) => {
        invokedSecurityId = secId;
      }
    );

    expect(decision.decision).toBe("INVOKE");
    expect(invokedSecurityId).toBe(securityId);

    const { data: rows } = await supabase
      .from("router_decisions")
      .select("decision")
      .eq("security_id", securityId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(rows?.[0].decision).toBe("INVOKE");
  });

  it("fails closed with a clear reason when the tier code doesn't exist", async () => {
    const decision = await routeAndInvoke({
      candidateRankingId: null,
      securityId,
      researchRunId: null,
      rank: 1,
      confidence: 0.99,
      disagreement: null,
      materialChangeFlag: false,
      lastAnalysisAt: null,
      tierCode: "NONEXISTENT_TIER",
    });
    expect(decision.decision).toBe("SKIP");
    expect(decision.reasoning).toMatch(/no routing_tier_configs row/i);
  });
});
