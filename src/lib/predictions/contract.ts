import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ForecastHorizon, IdeaDirection } from "@/lib/supabase/types";

export type StandardizedPredictionInput = {
  securityId: string;
  modelId: string;
  modelVersionId: string;
  environment: "PRODUCTION" | "SHADOW" | "EXPERIMENT";
  direction: IdeaDirection;
  score?: number | null;
  referencePrice: number;
  referencePriceAt: string;
  horizon: ForecastHorizon;
  expectedReturn?: number | null;
  probabilityPositive?: number | null;
  probabilityNegative?: number | null;
  confidence?: number | null;
  thesis?: string | null;
  estimatedInferenceCostUsd?: number | null;
  actualInferenceCostUsd?: number | null;
  featureValueIds?: string[];
  researchRunId?: string | null;
};

export type StandardizedPredictionResult = { predictionId: string; predictionHorizonId: string };

/**
 * The one writer used by baseline/candidate-ranking/shadow model code —
 * any model type (naive baseline, logistic regression, a future neural
 * model) satisfies the exact same standardized contract PMNTx Core and
 * the LLM agents already use, by writing into the SAME Prediction
 * Warehouse (predictions/prediction_horizons — 010_ideas_and_predictions.sql),
 * never a competing duplicate. origin is always 'ML_MODEL' here — never
 * 'PMNTX_CORE' — so a model-origin prediction is correctly excluded from
 * PMNTx Meta's consensus (which auto-admits anything with
 * origin==='PMNTX_CORE') and from Morning Brief's PMNTX_CORE-only section,
 * regardless of `environment`. See src/lib/models/shadow-mode.test.ts.
 */
export async function freezeStandardizedPrediction(input: StandardizedPredictionInput): Promise<StandardizedPredictionResult> {
  const supabase = createServiceRoleClient();

  // Validate BEFORE any insert — a prediction is frozen (and therefore
  // permanently immutable) the moment the predictions row is created, so
  // any input that would corrupt provenance or violate the point-in-time
  // guarantee must be rejected here, not discovered after the fact. This
  // also avoids the specific partial-write failure mode where a bad
  // featureValueId used to fail on the LAST insert (the snapshot),
  // leaving an already-frozen, permanently orphaned prediction behind.
  const { data: modelVersionRow, error: modelVersionLookupError } = await supabase
    .from("model_versions")
    .select("model_id")
    .eq("id", input.modelVersionId)
    .maybeSingle();
  if (modelVersionLookupError) throw modelVersionLookupError;
  if (!modelVersionRow) {
    throw new Error(`freezeStandardizedPrediction: model_version ${input.modelVersionId} does not exist.`);
  }
  if (modelVersionRow.model_id !== input.modelId) {
    throw new Error(
      `freezeStandardizedPrediction: modelVersionId ${input.modelVersionId} belongs to model ${modelVersionRow.model_id}, not the supplied modelId ${input.modelId}.`
    );
  }

  if (input.featureValueIds && input.featureValueIds.length > 0) {
    const { data: featureValueRows, error: featureValueLookupError } = await supabase
      .from("feature_values")
      .select("id, available_at")
      .in("id", input.featureValueIds);
    if (featureValueLookupError) throw featureValueLookupError;

    const foundIds = new Set((featureValueRows ?? []).map((r) => r.id));
    const missingIds = input.featureValueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(`freezeStandardizedPrediction: feature_value id(s) not found: ${missingIds.join(", ")}.`);
    }

    const referenceTime = new Date(input.referencePriceAt).getTime();
    const notYetAvailable = (featureValueRows ?? []).filter((r) => new Date(r.available_at).getTime() > referenceTime);
    if (notYetAvailable.length > 0) {
      throw new Error(
        `freezeStandardizedPrediction: feature_value id(s) not yet available as of referencePriceAt (${input.referencePriceAt}): ` +
          notYetAvailable.map((r) => `${r.id} (available_at=${r.available_at})`).join(", ") +
          " — this would violate the point-in-time guarantee."
      );
    }
  }

  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .insert({
      security_id: input.securityId,
      origin: "ML_MODEL",
      research_run_id: input.researchRunId ?? null,
      direction: input.direction,
    })
    .select("id")
    .single();
  if (ideaError || !idea) throw ideaError ?? new Error("Failed to create idea.");

  const now = new Date().toISOString();
  const { data: prediction, error: predictionError } = await supabase
    .from("predictions")
    .insert({
      idea_id: idea.id,
      security_id: input.securityId,
      origin: "ML_MODEL",
      research_run_id: input.researchRunId ?? null,
      data_cutoff: now,
      reference_price: input.referencePrice,
      reference_price_at: input.referencePriceAt,
      direction: input.direction,
      score: input.score ?? null,
      score_version: "v1",
      thesis: input.thesis ?? null,
      model_id: input.modelId,
      model_version_id: input.modelVersionId,
      environment: input.environment,
      estimated_inference_cost_usd: input.estimatedInferenceCostUsd ?? null,
      actual_inference_cost_usd: input.actualInferenceCostUsd ?? null,
      frozen_at: now,
    })
    .select("id")
    .single();
  if (predictionError || !prediction) throw predictionError ?? new Error("Failed to create prediction.");

  const { data: predictionHorizon, error: horizonError } = await supabase
    .from("prediction_horizons")
    .insert({
      prediction_id: prediction.id,
      horizon: input.horizon,
      forecast_type: "FORECAST",
      expected_return: input.expectedReturn ?? null,
      probability_positive: input.probabilityPositive ?? null,
      probability_negative: input.probabilityNegative ?? null,
      confidence: input.confidence ?? null,
    })
    .select("id")
    .single();
  if (horizonError || !predictionHorizon) throw horizonError ?? new Error("Failed to create prediction_horizons.");

  if (input.featureValueIds && input.featureValueIds.length > 0) {
    const { error: snapshotError } = await supabase.from("prediction_feature_snapshot").insert(
      input.featureValueIds.map((featureValueId) => ({ prediction_id: prediction.id, feature_value_id: featureValueId }))
    );
    if (snapshotError) throw snapshotError;
  }

  return { predictionId: prediction.id, predictionHorizonId: predictionHorizon.id };
}
