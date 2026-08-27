import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordCostEntry } from "@/lib/cost-ledger/ledger";

import { freezeStandardizedPrediction } from "./contract";

describe("AUDIT: §8 model/feature provenance reconstruction — one concrete prediction", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;
  let predictionId: string;
  let featureValueId: string;

  afterAll(async () => {
    await supabase.from("cost_ledger_entries").delete().eq("prediction_id", predictionId);
    await supabase.from("feature_values").delete().eq("security_id", securityId);
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("creates one realistic prediction with a full evidentiary chain", async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `PROVAUDIT_${randomUUID().slice(0, 8)}`, name: "Provenance Audit Security" })
      .select("id")
      .single();
    securityId = security!.id;

    modelId = await registerModel({ code: `PROVAUDIT_MODEL_${randomUUID().slice(0, 6)}`, name: "Provenance Audit Model", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1", costClass: "FREE", requiredFeatureSchemaVersion: "v1" });
    modelVersionId = version.id;

    const { data: featureDef } = await supabase
      .from("feature_definitions")
      .insert({ code: `PROVAUDIT_MOMENTUM_${randomUUID().slice(0, 6)}`, name: "test momentum", family: "MOMENTUM", schema_version: "v1" })
      .select("id")
      .single();
    const { data: featureValue } = await supabase
      .from("feature_values")
      .insert({
        feature_definition_id: featureDef!.id,
        security_id: securityId,
        value: 0.42,
        observation_at: "2026-07-01T23:59:59.000Z",
        available_at: "2026-07-01T23:59:59.000Z",
        source: "market_prices",
        source_version: "v1",
        feature_schema_version: "v1",
      })
      .select("id")
      .single();
    featureValueId = featureValue!.id;

    const frozen = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "SHADOW",
      direction: "LONG",
      score: 0.84,
      referencePrice: 123.45,
      referencePriceAt: "2026-07-01T23:59:59.000Z",
      horizon: "D21",
      probabilityPositive: 0.71,
      featureValueIds: [featureValueId],
    });
    predictionId = frozen.predictionId;

    await recordCostEntry({
      provider: "INTERNAL_COMPUTE",
      category: "FEATURE_COMPUTE",
      securityId,
      predictionId,
      modelVersionId,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
    });
  });

  it("reconstructs every required provenance element from ONLY the predictionId — no side-channel knowledge", async () => {
    // Simulates a genuinely independent reconstruction: start from nothing
    // but the prediction's own ID, as an auditor would.
    const { data: prediction, error: predictionError } = await supabase
      .from("predictions")
      .select("id, security_id, model_id, model_version_id, environment, direction, score, reference_price, reference_price_at, frozen_at, created_at, origin")
      .eq("id", predictionId)
      .single();
    expect(predictionError).toBeNull();

    // 1. Exact model and model version.
    const { data: modelVersion } = await supabase
      .from("model_versions")
      .select("id, model_id, version, status, required_feature_schema_version")
      .eq("id", prediction!.model_version_id!)
      .single();
    const { data: modelRow } = await supabase.from("models").select("code, name, model_type").eq("id", modelVersion!.model_id).single();
    expect(modelRow?.code).toMatch(/^PROVAUDIT_MODEL_/);
    expect(modelVersion?.version).toBe("v1");

    // 2. Prediction timestamp and horizon.
    const { data: horizon } = await supabase
      .from("prediction_horizons")
      .select("horizon, probability_positive, created_at")
      .eq("prediction_id", predictionId)
      .single();
    expect(horizon?.horizon).toBe("D21");
    expect(prediction?.frozen_at).toBeTruthy();

    // 3. Environment.
    expect(prediction?.environment).toBe("SHADOW");

    // 4. Exact feature values used.
    const { data: snapshot } = await supabase
      .from("prediction_feature_snapshot")
      .select("feature_value_id")
      .eq("prediction_id", predictionId);
    expect(snapshot).toHaveLength(1);
    expect(snapshot?.[0].feature_value_id).toBe(featureValueId);

    const { data: featureValueRow } = await supabase
      .from("feature_values")
      .select("value, feature_definition_id, feature_schema_version, source, source_version, observation_at, available_at")
      .eq("id", snapshot![0].feature_value_id)
      .single();
    expect(Number(featureValueRow?.value)).toBe(0.42);

    // 5. Feature schema/version.
    expect(featureValueRow?.feature_schema_version).toBe("v1");

    // 6. Source/provenance of the feature.
    expect(featureValueRow?.source).toBe("market_prices");
    const { data: featureDefRow } = await supabase
      .from("feature_definitions")
      .select("code, family, schema_version")
      .eq("id", featureValueRow!.feature_definition_id)
      .single();
    expect(featureDefRow?.family).toBe("MOMENTUM");

    // 7. Cost record, if applicable.
    const { data: costRows } = await supabase.from("cost_ledger_entries").select("category, actual_cost_usd").eq("prediction_id", predictionId);
    expect(costRows).toHaveLength(1);
    expect(costRows?.[0].category).toBe("FEATURE_COMPUTE");

    console.log("[§8] FULL RECONSTRUCTION SUCCEEDED from predictionId alone: model=" + modelRow?.code + "@" + modelVersion?.version +
      ", environment=" + prediction?.environment + ", horizon=" + horizon?.horizon +
      ", feature=" + featureDefRow?.code + "=" + featureValueRow?.value + " (schema " + featureValueRow?.feature_schema_version + ", source " + featureValueRow?.source + ")" +
      ", cost=$" + costRows?.[0].actual_cost_usd);
  });

  it("IDENTIFIED GAP: the reconstructed feature value's integrity is NOT itself guaranteed — it could have been mutated after freeze (see §2 finding E)", async () => {
    // This test doesn't re-prove finding E (already proven in
    // src/lib/feature-store/audit-leakage.test.ts) — it documents the
    // provenance-reconstruction consequence: an auditor reconstructing
    // this exact prediction's evidentiary basis is trusting that
    // feature_values.value hasn't changed since freeze, which is NOT
    // database-enforced. This is the concrete "gap" §8 of the brief asks
    // to identify, expressed in terms of what an auditor actually gets.
    const { data: before } = await supabase.from("feature_values").select("value").eq("id", featureValueId).single();
    expect(Number(before?.value)).toBe(0.42);
    console.log("[§8 GAP] The feature_values row backing this prediction's snapshot has no immutability trigger — its recorded value (0.42) is the value TODAY, not a cryptographically or DB-guaranteed value AS OF the freeze. See finding [E] for direct proof this is mutable.");
  });
});
