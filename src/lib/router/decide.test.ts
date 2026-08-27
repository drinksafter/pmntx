import { describe, expect, it } from "vitest";

import { decideRouting } from "./decide";
import type { RoutingInput, RoutingTierConfig } from "./types";

const TIER: RoutingTierConfig = {
  tierCode: "TEST_TIER",
  displayName: "Test Tier",
  minRank: 1,
  maxRank: 25,
  minConfidence: 0.55,
  minDisagreement: null,
  requiresMaterialChange: false,
  maxDailyInvocations: null,
  minHoursSinceLastAnalysis: 24,
  isEnabled: true,
};

function baseInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    candidateRankingId: "cr-1",
    securityId: "sec-1",
    rank: 5,
    confidence: 0.7,
    disagreement: null,
    materialChangeFlag: false,
    lastAnalysisAt: null,
    now: "2026-01-01T00:00:00.000Z",
    budgetRemainingDailyUsd: 10,
    budgetRemainingMonthlyUsd: 100,
    ...overrides,
  };
}

describe("router/decide", () => {
  it("[property #7 high-rank] INVOKEs a high-rank, high-confidence candidate", () => {
    const result = decideRouting(baseInput({ rank: 3, confidence: 0.8 }), TIER);
    expect(result.decision).toBe("INVOKE");
  });

  it("[property #6 low-rank] SKIPs a candidate outside the rank window even with high confidence", () => {
    const result = decideRouting(baseInput({ rank: 50, confidence: 0.9 }), TIER);
    expect(result.decision).toBe("SKIP");
  });

  it("[property #6 unjustified] SKIPs an in-rank candidate with confidence below the tier threshold", () => {
    const result = decideRouting(baseInput({ rank: 5, confidence: 0.3 }), TIER);
    expect(result.decision).toBe("SKIP");
  });

  it("[property #7 disagreement] a material disagreement can justify INVOKE even if confidence is unset", () => {
    const tier: RoutingTierConfig = { ...TIER, minConfidence: null, minDisagreement: 0.25 };
    const result = decideRouting(baseInput({ rank: 5, confidence: null, disagreement: 0.5 }), tier);
    expect(result.decision).toBe("INVOKE");
  });

  it("[property #7 material change] a flagged material change can justify INVOKE on its own", () => {
    const tier: RoutingTierConfig = { ...TIER, minConfidence: null, requiresMaterialChange: true };
    const result = decideRouting(baseInput({ rank: 5, confidence: null, materialChangeFlag: true }), tier);
    expect(result.decision).toBe("INVOKE");
  });

  it("[property #8 daily budget] SKIPs regardless of eligibility once the daily budget is exhausted", () => {
    const result = decideRouting(baseInput({ rank: 1, confidence: 0.99, budgetRemainingDailyUsd: 0 }), TIER);
    expect(result.decision).toBe("SKIP");
    expect(result.reasoning).toMatch(/budget/i);
  });

  it("[property #8 monthly budget] SKIPs once the monthly budget is exhausted even if daily remains", () => {
    const result = decideRouting(baseInput({ rank: 1, confidence: 0.99, budgetRemainingMonthlyUsd: 0 }), TIER);
    expect(result.decision).toBe("SKIP");
  });

  it("[property #9 freshness] SKIPs a redundant re-analysis within the freshness window with no material change", () => {
    const result = decideRouting(
      baseInput({ lastAnalysisAt: "2026-01-01T00:00:00.000Z", now: "2026-01-01T02:00:00.000Z" }), // 2h later, window is 24h
      TIER
    );
    expect(result.decision).toBe("SKIP");
    expect(result.reasoning).toMatch(/freshness|ago/i);
  });

  it("[property #9 override] a material change overrides the freshness suppression", () => {
    const result = decideRouting(
      baseInput({
        lastAnalysisAt: "2026-01-01T00:00:00.000Z",
        now: "2026-01-01T02:00:00.000Z",
        materialChangeFlag: true,
      }),
      TIER
    );
    expect(result.decision).toBe("INVOKE");
  });

  it("fails closed when the tier is disabled", () => {
    const result = decideRouting(baseInput({ rank: 1, confidence: 0.99 }), { ...TIER, isEnabled: false });
    expect(result.decision).toBe("SKIP");
  });

  it("fails closed on an ambiguous candidate with no configured signal at all matching", () => {
    // Tier requires a confidence signal; candidate has none.
    const result = decideRouting(baseInput({ confidence: null, disagreement: null, materialChangeFlag: false }), TIER);
    expect(result.decision).toBe("SKIP");
  });
});
