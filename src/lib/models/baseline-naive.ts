/**
 * The mandatory floor every other model must beat (pivot brief §13).
 * Predicts the majority class (or the historical mean, for a regression-
 * shaped label) from the training set — no features, no learning.
 */
export function trainNaiveMajorityClassifier(trainLabels: number[]): { predict: () => number; majorityLabel: number } {
  const positives = trainLabels.filter((l) => l === 1).length;
  const majorityLabel = positives >= trainLabels.length - positives ? 1 : 0;
  return { predict: () => majorityLabel, majorityLabel };
}

export function trainNaiveMeanRegressor(trainValues: number[]): { predict: () => number; mean: number } {
  const mean = trainValues.length ? trainValues.reduce((a, b) => a + b, 0) / trainValues.length : 0;
  return { predict: () => mean, mean };
}
