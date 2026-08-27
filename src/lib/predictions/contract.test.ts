import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { freezeStandardizedPrediction } from "./contract";

describe("predictions/contract", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;
  const predictionIds: string[] = [];

  beforeAll(async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `CONTRACTTEST_${randomUUID().slice(0, 8)}`, name: "Contract Test Security" })
      .select("id")
      .single();
    securityId = security!.id;

    modelId = await registerModel({ code: `CONTRACT_TEST_MODEL_${randomUUID().slice(0, 8)}`, name: "Test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });
    modelVersionId = version.id;
  });

  afterAll(async () => {
    for (const id of predictionIds) {
      await supabase.from("prediction_horizons").delete().eq("prediction_id", id);
      await supabase.from("predictions").delete().eq("id", id);
    }
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("[property #3] writes an immutable prediction — the existing freeze trigger still rejects mutation after this migration", async () => {
    const result = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "EXPERIMENT",
      direction: "LONG",
      referencePrice: 100,
      referencePriceAt: new Date().toISOString(),
      horizon: "D21",
      probabilityPositive: 0.6,
    });
    predictionIds.push(result.predictionId);

    const { error } = await supabase.from("predictions").update({ score: 999 }).eq("id", result.predictionId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/frozen/i);
  });

  it("[property #4/#12] model_id/model_version_id are always populated, and origin is ML_MODEL, not PMNTX_CORE", async () => {
    const result = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "SHADOW",
      direction: "SHORT",
      referencePrice: 50,
      referencePriceAt: new Date().toISOString(),
      horizon: "D5",
    });
    predictionIds.push(result.predictionId);

    const { data } = await supabase
      .from("predictions")
      .select("origin, model_id, model_version_id, environment")
      .eq("id", result.predictionId)
      .single();
    expect(data?.origin).toBe("ML_MODEL");
    expect(data?.model_id).toBe(modelId);
    expect(data?.model_version_id).toBe(modelVersionId);
    expect(data?.environment).toBe("SHADOW");
  });

  it("records which feature_values fed the prediction, and that snapshot is immutable too", async () => {
    const { data: featureDef } = await supabase
      .from("feature_definitions")
      .insert({ code: `CONTRACTTEST_FEATURE_${randomUUID().slice(0, 8)}`, name: "test", family: "MOMENTUM" })
      .select("id")
      .single();
    const { data: featureValue } = await supabase
      .from("feature_values")
      .insert({
        feature_definition_id: featureDef!.id,
        security_id: securityId,
        value: 1,
        observation_at: new Date().toISOString(),
        available_at: new Date().toISOString(),
        source: "test",
      })
      .select("id")
      .single();

    const result = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "EXPERIMENT",
      direction: "WATCH",
      referencePrice: 75,
      referencePriceAt: new Date().toISOString(),
      horizon: "D10",
      featureValueIds: [featureValue!.id],
    });
    predictionIds.push(result.predictionId);

    const { data: snapshot } = await supabase
      .from("prediction_feature_snapshot")
      .select("feature_value_id")
      .eq("prediction_id", result.predictionId);
    expect(snapshot).toHaveLength(1);
    expect(snapshot?.[0].feature_value_id).toBe(featureValue!.id);

    const { error } = await supabase.from("prediction_feature_snapshot").delete().eq("prediction_id", result.predictionId);
    expect(error).not.toBeNull(); // frozen parent -> child immutable too

    await supabase.from("feature_values").delete().eq("id", featureValue!.id);
    await supabase.from("feature_definitions").delete().eq("id", featureDef!.id);
  });
});
