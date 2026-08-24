export type HunterContribution = {
  hunterCode: string;
  normalizedScore: number; // -1..1
  confidence: number; // 0..1
  dataQuality: number; // 0..1
};

export type CompositeScore = {
  score: number; // -1..1, confidence*data_quality-weighted average of contributions
  components: Record<string, { score: number; confidence: number; dataQuality: number }>;
};

/**
 * Combines every active Hunter's signal for one security into a single
 * composite score. Weighting by confidence*dataQuality means a
 * high-confidence, high-quality signal from one Hunter can outweigh a
 * weak, low-quality signal from another, rather than a naive average
 * treating every Hunter's opinion as equally trustworthy.
 */
export function composeScore(contributions: HunterContribution[]): CompositeScore {
  const components: CompositeScore["components"] = {};
  let weightedSum = 0;
  let weightSum = 0;

  for (const c of contributions) {
    const weight = c.confidence * c.dataQuality;
    weightedSum += c.normalizedScore * weight;
    weightSum += weight;
    components[c.hunterCode] = { score: c.normalizedScore, confidence: c.confidence, dataQuality: c.dataQuality };
  }

  return { score: weightSum > 0 ? weightedSum / weightSum : 0, components };
}
