import "server-only";

import { trainLogisticRegression } from "@/lib/models/baseline-logistic";
import { trainNaiveMajorityClassifier } from "@/lib/models/baseline-naive";
import { registerModelVersion } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { buildDataset } from "./dataset";
import type { ExperimentConfig, ExperimentRunResult, LabeledRow, PromotionDecision } from "./types";

function accuracy(predictions: number[], labels: number[]): number {
  if (predictions.length === 0) return 0;
  const correct = predictions.reduce((count, p, i) => count + (p === labels[i] ? 1 : 0), 0);
  return correct / predictions.length;
}

// A logistic model must beat naive by at least this much on the held-out
// test set to be promoted — otherwise the added complexity isn't earning
// its keep (pivot brief §13 "baselines are mandatory").
const PROMOTION_MARGIN = 0.02;

/**
 * DATASET -> TRAIN -> VALIDATE -> WALK-FORWARD TEST -> COST/SLIPPAGE
 * ADJUSTMENT -> BENCHMARK -> PROMOTION DECISION. The one baseline
 * experiment this phase implements (pivot brief §12): naive majority-class
 * vs. hand-rolled logistic regression on a chronologically-split dataset.
 * Never decides PRODUCTION — see PromotionDecision's type (no production-
 * flavored value exists) and the DB check constraint backing it up.
 */
export async function runBaselineExperiment(
  config: ExperimentConfig,
  rows: LabeledRow[],
  modelId: string,
  options: { isMock?: boolean } = {}
): Promise<ExperimentRunResult> {
  const supabase = createServiceRoleClient();

  // DATASET
  const dataset = buildDataset(rows, config.boundaries);

  const { data: experiment, error: experimentError } = await supabase
    .from("experiments")
    .insert({
      name: config.name,
      hypothesis: config.hypothesis,
      status: "DATASET_DEFINED",
      random_seed: config.seed,
      train_start_date: config.boundaries.trainStart.slice(0, 10),
      train_end_date: config.boundaries.trainEnd.slice(0, 10),
      validation_start_date: config.boundaries.validationStart.slice(0, 10),
      validation_end_date: config.boundaries.validationEnd.slice(0, 10),
      test_start_date: config.boundaries.testStart.slice(0, 10),
      test_end_date: config.boundaries.testEnd.slice(0, 10),
      dataset_start_date: config.boundaries.trainStart.slice(0, 10),
      dataset_end_date: config.boundaries.testEnd.slice(0, 10),
    })
    .select("id")
    .single();
  if (experimentError || !experiment) throw experimentError ?? new Error("Failed to create experiment.");

  const { data: run, error: runError } = await supabase
    .from("experiment_runs")
    .insert({
      experiment_id: experiment.id,
      status: "TRAINING",
      started_at: new Date().toISOString(),
      seed_used: config.seed,
      train_row_count: dataset.train.length,
      validation_row_count: dataset.validation.length,
      test_row_count: dataset.test.length,
      is_mock: options.isMock ?? true,
    })
    .select("id")
    .single();
  if (runError || !run) throw runError ?? new Error("Failed to create experiment_run.");

  // TRAIN
  const trainLabels = dataset.train.map((r) => r.label);
  const trainFeatures = dataset.train.map((r) => r.features);
  const naive = trainNaiveMajorityClassifier(trainLabels);
  const logistic = trainLogisticRegression(trainFeatures, trainLabels, { seed: config.seed });

  // VALIDATE (used here only to confirm the model trained sensibly before
  // spending the held-out test set — not itself the promotion signal)
  const validationLabels = dataset.validation.map((r) => r.label);
  const validationLogisticPreds = dataset.validation.map((r) => (logistic.predictProbability(r.features) >= 0.5 ? 1 : 0));
  const validationAccuracy = accuracy(validationLogisticPreds, validationLabels);

  // WALK-FORWARD TEST (held-out, chronologically after both train and validation)
  const testLabels = dataset.test.map((r) => r.label);
  const naivePreds = dataset.test.map(() => naive.majorityLabel);
  const logisticPreds = dataset.test.map((r) => (logistic.predictProbability(r.features) >= 0.5 ? 1 : 0));
  const naiveAccuracy = accuracy(naivePreds, testLabels);
  const logisticAccuracy = accuracy(logisticPreds, testLabels);

  // COST/SLIPPAGE ADJUSTMENT — a hook, not implemented this phase (no
  // real trading costs are being modeled by a baseline classifier over
  // synthetic data); recorded honestly as zero rather than fabricated.
  const costAdjustmentBps = 0;

  // BENCHMARK + PROMOTION DECISION — deterministic, never PRODUCTION.
  const logisticBeatsNaive = logisticAccuracy >= naiveAccuracy + PROMOTION_MARGIN;
  const marginIsAmbiguous = Math.abs(logisticAccuracy - naiveAccuracy) < PROMOTION_MARGIN / 2;

  let promotionDecision: PromotionDecision;
  let candidateModelVersionId: string | null = null;
  if (marginIsAmbiguous) {
    promotionDecision = "INCONCLUSIVE";
  } else if (logisticBeatsNaive) {
    promotionDecision = "PROMOTE_TO_SHADOW";
    const version = await registerModelVersion({ modelId, version: `exp-${run.id.slice(0, 8)}`, costClass: "FREE" });
    candidateModelVersionId = version.id;
  } else {
    promotionDecision = "REJECT";
  }

  await supabase
    .from("experiments")
    .update({ status: "PROMOTION_DECIDED", cost_adjustment_bps: costAdjustmentBps })
    .eq("id", experiment.id);

  await supabase
    .from("experiment_runs")
    .update({
      status: "COMPLETE",
      completed_at: new Date().toISOString(),
      promotion_decision: promotionDecision,
      promoted_model_version_id: candidateModelVersionId,
      results: { naiveAccuracy, logisticAccuracy, validationAccuracy, logisticBeatsNaive },
    })
    .eq("id", run.id);

  return {
    experimentId: experiment.id,
    experimentRunId: run.id,
    naiveAccuracy,
    logisticAccuracy,
    logisticBeatsNaive,
    promotionDecision,
    candidateModelVersionId,
  };
}
