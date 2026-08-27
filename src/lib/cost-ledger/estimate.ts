/**
 * Non-AI cost estimators. Local feature computation (pure TypeScript,
 * running on the same process as everything else) has no meaningful
 * marginal cost this phase — returned honestly as 0, not fabricated as
 * some invented per-call figure. A future phase with real training
 * compute (e.g. a hosted GPU job) would estimate a real number here.
 */
export function estimateFeatureComputeCostUsd(): number {
  return 0;
}

export function estimateQuantScoringCostUsd(): number {
  return 0;
}
