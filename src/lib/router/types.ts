export type RoutingTierConfig = {
  tierCode: string;
  displayName: string;
  minRank: number | null;
  maxRank: number | null;
  minConfidence: number | null;
  minDisagreement: number | null;
  requiresMaterialChange: boolean;
  maxDailyInvocations: number | null;
  minHoursSinceLastAnalysis: number | null;
  isEnabled: boolean;
};

export type RoutingInput = {
  candidateRankingId: string | null;
  securityId: string;
  rank: number;
  confidence: number | null;
  disagreement: number | null;
  materialChangeFlag: boolean;
  lastAnalysisAt: string | null;
  now: string;
  budgetRemainingDailyUsd: number;
  budgetRemainingMonthlyUsd: number;
};

export type RoutingDecision = {
  decision: "INVOKE" | "SKIP";
  reasoning: string;
  tierCode: string;
};
