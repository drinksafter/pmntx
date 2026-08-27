export type LabeledRow = {
  securityId: string;
  observationAt: string; // chronological key the dataset split is enforced against
  features: number[];
  label: number; // 1 = positive return over the horizon, 0 = not
};

export type SplitBoundaries = {
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  testStart: string;
  testEnd: string;
};

export type DatasetSplit = {
  train: LabeledRow[];
  validation: LabeledRow[];
  test: LabeledRow[];
};

export type ExperimentConfig = {
  name: string;
  hypothesis: string;
  seed: number;
  boundaries: SplitBoundaries;
};

export type PromotionDecision = "PROMOTE_TO_VALIDATED" | "PROMOTE_TO_SHADOW" | "REJECT" | "INCONCLUSIVE";

export type ExperimentRunResult = {
  experimentId: string;
  experimentRunId: string;
  naiveAccuracy: number;
  logisticAccuracy: number;
  logisticBeatsNaive: boolean;
  promotionDecision: PromotionDecision;
  candidateModelVersionId: string | null;
};
