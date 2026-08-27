import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { freezeStandardizedPrediction } from "./contract";

describe("AUDIT: §12 chaos/failure — partial-state and transaction boundaries", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;

  afterAll(async () => {
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("setup", async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `CHAOSAUDIT_${randomUUID().slice(0, 8)}`, name: "Chaos Audit" })
      .select("id")
      .single();
    securityId = security!.id;
    modelId = await registerModel({ code: `CHAOSAUDIT_MODEL_${randomUUID().slice(0, 6)}`, name: "test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });
    modelVersionId = version.id;
  });

  it("[FIXED — was NO TRANSACTION BOUNDARY] a bogus featureValueId is now rejected BEFORE any insert — no orphaned frozen prediction is left behind", async () => {
    const bogusFeatureValueId = randomUUID(); // does not exist in feature_values

    let threw = false;
    let thrownMessage = "";
    try {
      await freezeStandardizedPrediction({
        securityId,
        modelId,
        modelVersionId,
        environment: "EXPERIMENT",
        direction: "LONG",
        referencePrice: 100,
        referencePriceAt: new Date().toISOString(),
        horizon: "D5",
        featureValueIds: [bogusFeatureValueId],
      });
    } catch (err) {
      threw = true;
      thrownMessage = err instanceof Error ? err.message : String(err);
    }

    expect(threw).toBe(true);
    expect(thrownMessage).toMatch(/not found/i);

    // The fix: validation now happens BEFORE any insert, so no idea or
    // prediction should exist at all — not even an orphaned frozen one.
    const { data: orphanedIdeas } = await supabase.from("ideas").select("id").eq("security_id", securityId).eq("origin", "ML_MODEL");
    const { data: orphanedPredictions } = await supabase
      .from("predictions")
      .select("id, frozen_at")
      .eq("security_id", securityId)
      .eq("model_version_id", modelVersionId);

    expect(orphanedIdeas ?? []).toHaveLength(0);
    expect(orphanedPredictions ?? []).toHaveLength(0);
  });

  it("[FIXED — was malformed pairing accepted] a mismatched modelVersionId/modelId pair is now rejected before any insert", async () => {
    const otherModelId = await registerModel({ code: `CHAOSAUDIT_OTHER_${randomUUID().slice(0, 6)}`, name: "other", modelType: "NEURAL" });
    const otherVersion = await registerModelVersion({ modelId: otherModelId, version: "v1" });

    // Deliberately mismatched: modelId points to the FIRST model, but
    // modelVersionId points to a version belonging to the SECOND model.
    let threw = false;
    let thrownMessage = "";
    let predictionId: string | null = null;
    try {
      const result = await freezeStandardizedPrediction({
        securityId,
        modelId, // model A
        modelVersionId: otherVersion.id, // a version of model B
        environment: "EXPERIMENT",
        direction: "SHORT",
        referencePrice: 50,
        referencePriceAt: new Date().toISOString(),
        horizon: "D5",
      });
      predictionId = result.predictionId;
    } catch (err) {
      threw = true;
      thrownMessage = err instanceof Error ? err.message : String(err);
    }

    expect(threw).toBe(true);
    expect(thrownMessage).toMatch(/does not belong|belongs to model/i);
    expect(predictionId).toBeNull();

    // cleanup
    await supabase.from("model_versions").delete().eq("model_id", otherModelId);
    await supabase.from("models").delete().eq("id", otherModelId);
  });

  it("[malformed numeric values] NaN is accepted by the numeric `value` column on feature_values", async () => {
    const { data: def } = await supabase
      .from("feature_definitions")
      .insert({ code: `CHAOSAUDIT_NAN_${randomUUID().slice(0, 6)}`, name: "test", family: "MOMENTUM" })
      .select("id")
      .single();

    const { error: nanError } = await supabase.from("feature_values").insert({
      feature_definition_id: def!.id,
      security_id: securityId,
      value: NaN,
      observation_at: new Date().toISOString(),
      available_at: new Date().toISOString(),
      source: "test",
    });
    console.log(`[chaos] inserting value=NaN into feature_values: error=${nanError?.message ?? "none — accepted"}`);

    const { data: after } = await supabase.from("feature_values").select("value").eq("feature_definition_id", def!.id).maybeSingle();
    console.log(`[chaos] stored value after NaN insert attempt: ${after?.value}`);
    if (nanError === null) {
      console.log("FINDING: Postgres `numeric` accepts NaN as a valid value with no application-level rejection — a NaN feature value could silently propagate into a model's scoring logic (e.g. rankCandidates' compositeScore average) and corrupt ranking without an error anywhere.");
    }
  });

  it("[unknown feature codes] getFeaturesAsOf with a nonexistent feature code returns empty, not a crash", async () => {
    const { getFeaturesAsOf } = await import("@/lib/feature-store/store");
    const result = await getFeaturesAsOf(securityId, new Date().toISOString(), ["TOTALLY_MADE_UP_FEATURE_CODE_XYZ"]);
    expect(result).toEqual([]);
  });
});
