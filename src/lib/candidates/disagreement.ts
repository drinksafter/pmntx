import type { ModelScore } from "./types";

/**
 * Model disagreement is information, not noise (pivot brief §15) — never
 * reduce contributing scores to a plain average without also preserving
 * how much they actually disagreed. Standard deviation across contributing
 * model scores; null when fewer than 2 models scored a security (nothing
 * to disagree about yet).
 */
export function computeModelDisagreement(scores: ModelScore[]): number | null {
  if (scores.length < 2) return null;
  const values = scores.map((s) => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
