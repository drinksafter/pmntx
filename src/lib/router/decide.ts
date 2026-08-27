import type { RoutingDecision, RoutingInput, RoutingTierConfig } from "./types";

function meetsTierCriteria(input: RoutingInput, tier: RoutingTierConfig): boolean {
  if (tier.minRank != null && input.rank < tier.minRank) return false;
  if (tier.maxRank != null && input.rank > tier.maxRank) return false;

  const confidenceSignal = tier.minConfidence != null && input.confidence != null && input.confidence >= tier.minConfidence;
  const disagreementSignal = tier.minDisagreement != null && input.disagreement != null && input.disagreement >= tier.minDisagreement;
  const materialChangeSignal = tier.requiresMaterialChange && input.materialChangeFlag;

  const hasAnySignalConfigured = tier.minConfidence != null || tier.minDisagreement != null || tier.requiresMaterialChange;
  if (!hasAnySignalConfigured) return true; // rank range alone is the gate for this tier
  return confidenceSignal || disagreementSignal || materialChangeSignal;
}

/**
 * Deterministic — no learned router this phase (pivot brief §16). Default
 * behavior fails closed: absent an explicit justification, the decision
 * is SKIP. Sits entirely upstream of src/lib/ai/gateway.ts and the
 * existing blind-analysis/agent pipeline functions — this module never
 * imports or calls either; see orchestrator.ts for how a decision here
 * gets acted on.
 */
export function decideRouting(input: RoutingInput, tier: RoutingTierConfig): RoutingDecision {
  const tierCode = tier.tierCode;

  if (!tier.isEnabled) {
    return { decision: "SKIP", reasoning: `Tier ${tierCode} is disabled.`, tierCode };
  }
  if (input.budgetRemainingDailyUsd <= 0) {
    return { decision: "SKIP", reasoning: "Daily AI budget exhausted.", tierCode };
  }
  if (input.budgetRemainingMonthlyUsd <= 0) {
    return { decision: "SKIP", reasoning: "Monthly AI budget exhausted.", tierCode };
  }
  if (!meetsTierCriteria(input, tier)) {
    return {
      decision: "SKIP",
      reasoning: `Candidate does not meet ${tierCode} tier criteria (rank #${input.rank}, confidence=${input.confidence ?? "n/a"}, disagreement=${input.disagreement ?? "n/a"}, materialChange=${input.materialChangeFlag}).`,
      tierCode,
    };
  }
  if (input.lastAnalysisAt && tier.minHoursSinceLastAnalysis != null) {
    const hoursSince = (new Date(input.now).getTime() - new Date(input.lastAnalysisAt).getTime()) / (60 * 60 * 1000);
    if (hoursSince < tier.minHoursSinceLastAnalysis && !input.materialChangeFlag) {
      return {
        decision: "SKIP",
        reasoning: `Analyzed ${hoursSince.toFixed(1)}h ago (< ${tier.minHoursSinceLastAnalysis}h freshness window) with no material change since.`,
        tierCode,
      };
    }
  }

  return {
    decision: "INVOKE",
    reasoning: `Meets ${tierCode} criteria: rank #${input.rank}, confidence=${input.confidence ?? "n/a"}, disagreement=${input.disagreement ?? "n/a"}, materialChange=${input.materialChangeFlag}.`,
    tierCode,
  };
}
