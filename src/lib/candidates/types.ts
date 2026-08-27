export type ModelScore = { modelCode: string; score: number };

export type SecurityScoreInput = {
  securityId: string;
  scores: ModelScore[]; // one or more contributing model scores for this security
  noveltySignal?: number | null;
  materialChangeFlag?: boolean;
};

export type RankedCandidate = {
  securityId: string;
  rank: number;
  compositeScore: number;
  scoreComponents: Record<string, number>;
  disagreement: number | null;
  noveltySignal: number | null;
  materialChangeFlag: boolean;
  selected: boolean;
  selectionReason: string | null;
};

export type CandidateRankingConfig = {
  maxCandidates: number;
  minScoreThreshold: number | null;
};
