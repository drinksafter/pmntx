import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { freezeStandardizedPrediction } from "@/lib/predictions/contract";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * ADVERSARIAL: does ON DELETE SET NULL on predictions.model_id/model_version_id
 * bypass the immutability trigger when the REFERENCED row (models/model_versions)
 * is deleted, rather than the predictions row itself? The trigger fires on
 * `before update or delete on predictions` — does Postgres's internal
 * UPDATE from a FK SET NULL action count?
 */
describe("AUDIT: FK cascade into frozen predictions", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;
  let predictionId: string;

  afterAll(async () => {
    await supabase.from("predictions").delete().eq("id", predictionId).then(() => {}); // expected to no-op if frozen
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("setup: create model/version/prediction", async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `FKAUDIT_${randomUUID().slice(0, 8)}`, name: "FK Audit Test" })
      .select("id")
      .single();
    securityId = security!.id;

    modelId = await registerModel({ code: `FKAUDIT_MODEL_${randomUUID().slice(0, 8)}`, name: "Test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });
    modelVersionId = version.id;

    const frozen = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "EXPERIMENT",
      direction: "LONG",
      referencePrice: 100,
      referencePriceAt: new Date().toISOString(),
      horizon: "D5",
    });
    predictionId = frozen.predictionId;

    const { data: check } = await supabase.from("predictions").select("model_id, model_version_id, frozen_at").eq("id", predictionId).single();
    expect(check?.model_id).toBe(modelId);
    expect(check?.frozen_at).toBeTruthy();
  });

  it("ADVERSARIAL: deleting the model_version row — does it null out the frozen prediction's provenance, or does immutability block it?", async () => {
    const { error: deleteVersionError } = await supabase.from("model_versions").delete().eq("id", modelVersionId);

    const { data: afterDelete } = await supabase
      .from("predictions")
      .select("model_id, model_version_id")
      .eq("id", predictionId)
      .single();

    console.log("deleteVersionError:", deleteVersionError?.message);
    console.log("prediction.model_version_id after model_versions delete attempt:", afterDelete?.model_version_id);

    // Report the actual outcome — this is exploratory, not asserting a
    // predetermined "safe" answer, since we don't yet know which one Postgres does.
    if (afterDelete?.model_version_id === null) {
      console.log("FINDING: FK cascade SUCCEEDED in nulling out a frozen prediction's model_version_id — immutability trigger did NOT block this path.");
    } else {
      console.log("FINDING: model_version_id unchanged — either the delete was blocked entirely, or the immutability trigger blocked the cascading UPDATE.");
    }

    // The immutability trigger firing means this DELETE failed and the
    // model_versions row must still exist (transaction rolled back).
    const { data: versionStillExists } = await supabase.from("model_versions").select("id").eq("id", modelVersionId).maybeSingle();
    expect(versionStillExists).not.toBeNull();
  });

  it("ADVERSARIAL: deleting the parent models row while referenced by a frozen prediction is also blocked", async () => {
    const { error: deleteModelError } = await supabase.from("models").delete().eq("id", modelId);
    expect(deleteModelError).not.toBeNull();
    expect(deleteModelError?.message).toMatch(/frozen/i);

    const { data: afterDelete } = await supabase.from("predictions").select("model_id").eq("id", predictionId).single();
    expect(afterDelete?.model_id).toBe(modelId); // unchanged
  });

  it("a feature_value referenced by a prediction_feature_snapshot cannot be deleted (ON DELETE RESTRICT)", async () => {
    const { data: featureDef } = await supabase
      .from("feature_definitions")
      .insert({ code: `FKAUDIT_FEATURE_${randomUUID().slice(0, 8)}`, name: "test", family: "MOMENTUM" })
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
    await supabase.from("prediction_feature_snapshot").insert({ prediction_id: predictionId, feature_value_id: featureValue!.id });

    const { error: deleteFeatureValueError } = await supabase.from("feature_values").delete().eq("id", featureValue!.id);
    expect(deleteFeatureValueError).not.toBeNull();
    expect(deleteFeatureValueError?.message).toMatch(/violates foreign key constraint/i);

    // Cleanup requires deleting the snapshot first — but that's blocked
    // too, since the parent prediction is frozen (verified above). This
    // feature_value/feature_definition pair is therefore permanently
    // undeletable, same as every other frozen-prediction-linked row in
    // this repo's established test pattern — left as identifiable
    // residue (FKAUDIT_ prefix), not cleaned up.
  });
});
