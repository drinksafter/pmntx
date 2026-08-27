import { createSeededRandom } from "@/lib/testing/deterministic-random";

export type LogisticRegressionModel = {
  weights: number[];
  bias: number;
  predictProbability: (features: number[]) => number;
};

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Hand-rolled batch gradient descent logistic regression — pure TS, no
 * dependency. Deliberately trivial: the pivot brief is explicit that "the
 * goal is to validate the lifecycle, not maximize model sophistication."
 * Weight init is seeded for reproducibility (pivot brief §12).
 */
export function trainLogisticRegression(
  features: number[][],
  labels: number[],
  options: { learningRate?: number; epochs?: number; seed?: number } = {}
): LogisticRegressionModel {
  const learningRate = options.learningRate ?? 0.1;
  const epochs = options.epochs ?? 500;
  const random = createSeededRandom(options.seed ?? 42);

  const numFeatures = features[0]?.length ?? 0;
  const weights = Array.from({ length: numFeatures }, () => (random() - 0.5) * 0.01);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(numFeatures).fill(0);
    let gradB = 0;

    for (let i = 0; i < features.length; i++) {
      const z = features[i].reduce((sum, x, j) => sum + x * weights[j], bias);
      const prediction = sigmoid(z);
      const error = prediction - labels[i];
      for (let j = 0; j < numFeatures; j++) gradW[j] += error * features[i][j];
      gradB += error;
    }

    for (let j = 0; j < numFeatures; j++) weights[j] -= (learningRate * gradW[j]) / features.length;
    bias -= (learningRate * gradB) / features.length;
  }

  return {
    weights,
    bias,
    predictProbability: (x: number[]) => sigmoid(x.reduce((sum, xi, j) => sum + xi * weights[j], bias)),
  };
}
