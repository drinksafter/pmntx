import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { getFeaturesAsOf, writeFeatureValue } from "./store";

/**
 * ADVERSARIAL point-in-time leakage tests (independent audit §2, items B-F —
 * item A is already covered by store.test.ts's "restated feature" test).
 */
describe("AUDIT: point-in-time leakage adversarial tests", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from("securities")
      .insert({ ticker: `LEAKAUDIT_${randomUUID().slice(0, 8)}`, name: "Leakage Audit Test" })
      .select("id")
      .single();
    securityId = data!.id;
  });

  afterAll(async () => {
    await supabase.from("feature_values").delete().eq("security_id", securityId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("[B] a newer observation that was unavailable at T is excluded — the older eligible observation is returned, not null", async () => {
    // obs1: observed and available on day 1.
    await writeFeatureValue({
      featureCode: "AUDIT_B_FEATURE",
      family: "MOMENTUM",
      securityId,
      value: 111,
      observationAt: "2026-01-01T00:00:00.000Z",
      availableAt: "2026-01-01T00:00:00.000Z",
      source: "test",
    });
    // obs2: a NEWER observation (day 5), but not actually available/published until day 10.
    await writeFeatureValue({
      featureCode: "AUDIT_B_FEATURE",
      family: "MOMENTUM",
      securityId,
      value: 222,
      observationAt: "2026-01-05T00:00:00.000Z",
      availableAt: "2026-01-10T00:00:00.000Z",
      source: "test",
    });

    // Query as of day 7 — obs2 (newer observation) is NOT yet available.
    const result = await getFeaturesAsOf(securityId, "2026-01-07T00:00:00.000Z", ["AUDIT_B_FEATURE"]);
    const found = result.find((f) => f.featureCode === "AUDIT_B_FEATURE");
    expect(found).toBeDefined();
    expect(found?.value).toBe(111); // the OLDER, eligible observation — not 222, not undefined
  });

  it("[C] available_at is the SOLE controlling boundary — effective_at/publication_at disagreeing with it has no effect on inclusion", async () => {
    const supabaseDirect = supabase;
    const { data: def } = await supabaseDirect
      .from("feature_definitions")
      .insert({ code: `AUDIT_C_FEATURE_${randomUUID().slice(0, 6)}`, name: "test", family: "FUNDAMENTALS" })
      .select("id")
      .single();

    // effective_at and publication_at both claim "available well before T"
    // (day 1), but available_at (the actual controlling column) says day 10.
    await supabaseDirect.from("feature_values").insert({
      feature_definition_id: def!.id,
      security_id: securityId,
      value: 999,
      observation_at: "2026-02-01T00:00:00.000Z",
      effective_at: "2026-02-01T00:00:00.000Z", // claims early
      publication_at: "2026-02-01T00:00:00.000Z", // claims early
      available_at: "2026-02-10T00:00:00.000Z", // actually late
      source: "test",
    });

    const { data: defRow } = await supabaseDirect.from("feature_definitions").select("code").eq("id", def!.id).single();
    const resultBefore = await getFeaturesAsOf(securityId, "2026-02-05T00:00:00.000Z", [defRow!.code]);
    expect(resultBefore.find((f) => f.featureCode === defRow!.code)).toBeUndefined();

    const resultAfter = await getFeaturesAsOf(securityId, "2026-02-15T00:00:00.000Z", [defRow!.code]);
    expect(resultAfter.find((f) => f.featureCode === defRow!.code)?.value).toBe(999);
  });

  it("[D] deterministic selection when two observations share the exact same observation_at (tie-break)", async () => {
    const featureCode = "AUDIT_D_FEATURE";
    // Two rows, identical observation_at, different values/available_at/insertion order.
    await writeFeatureValue({
      featureCode,
      family: "VALUATION",
      securityId,
      value: 1,
      observationAt: "2026-03-01T00:00:00.000Z",
      availableAt: "2026-03-01T00:00:00.000Z",
      source: "test-a",
    });
    await writeFeatureValue({
      featureCode,
      family: "VALUATION",
      securityId,
      value: 2,
      observationAt: "2026-03-01T00:00:00.000Z", // exact tie
      availableAt: "2026-03-01T00:00:00.000Z",
      source: "test-b",
    });

    const run1 = await getFeaturesAsOf(securityId, "2026-03-02T00:00:00.000Z", [featureCode]);
    const run2 = await getFeaturesAsOf(securityId, "2026-03-02T00:00:00.000Z", [featureCode]);
    const run3 = await getFeaturesAsOf(securityId, "2026-03-02T00:00:00.000Z", [featureCode]);

    const v1 = run1.find((f) => f.featureCode === featureCode)?.value;
    const v2 = run2.find((f) => f.featureCode === featureCode)?.value;
    const v3 = run3.find((f) => f.featureCode === featureCode)?.value;

    console.log(`[D] tie-break results across 3 identical queries: ${v1}, ${v2}, ${v3}`);
    // Report whether this is actually deterministic (same value every time)
    // or arbitrary (Postgres doesn't guarantee row order without an
    // explicit secondary sort key on a tie).
    if (v1 === v2 && v2 === v3) {
      console.log("[D] FINDING: tie-break appears stable across repeated queries in this run (may still be an artifact of physical row order, not a guaranteed ORDER BY tie-breaker).");
    } else {
      console.log("[D] FINDING: tie-break is NOT deterministic — different values returned across identical queries.");
    }
  });

  it("[E] a feature_value's `value` CAN be mutated after being referenced by a frozen prediction's snapshot — no immutability trigger on feature_values itself", async () => {
    const { data: def } = await supabase
      .from("feature_definitions")
      .insert({ code: `AUDIT_E_FEATURE_${randomUUID().slice(0, 6)}`, name: "test", family: "EARNINGS" })
      .select("id")
      .single();
    const { data: featureValue } = await supabase
      .from("feature_values")
      .insert({
        feature_definition_id: def!.id,
        security_id: securityId,
        value: 42,
        observation_at: "2026-04-01T00:00:00.000Z",
        available_at: "2026-04-01T00:00:00.000Z",
        source: "test",
      })
      .select("id")
      .single();

    // ADVERSARIAL: attempt to mutate the feature_value's own `value` field
    // directly (no prediction involved yet, isolating whether feature_values
    // itself has any immutability protection at all).
    const { error: mutateError } = await supabase.from("feature_values").update({ value: 999999 }).eq("id", featureValue!.id);

    const { data: after } = await supabase.from("feature_values").select("value").eq("id", featureValue!.id).single();

    console.log(`[E] mutate error: ${mutateError?.message ?? "none — mutation succeeded"}`);
    console.log(`[E] value after mutation attempt: ${after?.value} (original was 42)`);

    if (mutateError === null && Number(after?.value) === 999999) {
      console.log(
        "[E] FINDING: feature_values has NO immutability protection — its value CAN be silently changed after the fact, even while referenced by a prediction_feature_snapshot on a frozen prediction. The snapshot join table is immutable (which feature_value IDs are linked cannot change), but the referenced row's own VALUE is not protected."
      );
    }

    // This is exploratory reporting, not asserting a predetermined "safe"
    // outcome — report the actual DB behavior either way.
  });

  it("[F, FIXED] freezeStandardizedPrediction now rejects supplied featureValueIds that weren't actually available as of the prediction's reference time", async () => {
    const { registerModel, registerModelVersion } = await import("@/lib/models/registry");
    const { freezeStandardizedPrediction } = await import("@/lib/predictions/contract");

    const modelId = await registerModel({ code: `AUDIT_F_MODEL_${randomUUID().slice(0, 6)}`, name: "test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });

    // A feature value that is NOT available until far in the future.
    const { data: def } = await supabase
      .from("feature_definitions")
      .insert({ code: `AUDIT_F_FEATURE_${randomUUID().slice(0, 6)}`, name: "test", family: "EARNINGS" })
      .select("id")
      .single();
    const { data: futureFeature } = await supabase
      .from("feature_values")
      .insert({
        feature_definition_id: def!.id,
        security_id: securityId,
        value: 1,
        observation_at: "2030-01-01T00:00:00.000Z",
        available_at: "2030-01-01T00:00:00.000Z", // far future relative to the prediction below
        source: "test",
      })
      .select("id")
      .single();

    // [FIXED] Freeze a prediction dated TODAY (2026), but attach the
    // 2030-dated future feature value to it via featureValueIds — this
    // must now be rejected before any insert.
    let threwOnFreeze = false;
    let thrownMessage = "";
    let predictionId: string | null = null;
    try {
      const result = await freezeStandardizedPrediction({
        securityId,
        modelId,
        modelVersionId: version.id,
        environment: "EXPERIMENT",
        direction: "LONG",
        referencePrice: 100,
        referencePriceAt: "2026-05-01T00:00:00.000Z", // the prediction's own "as of" time
        horizon: "D5",
        featureValueIds: [futureFeature!.id], // a feature not available until 2030
      });
      predictionId = result.predictionId;
    } catch (err) {
      threwOnFreeze = true;
      thrownMessage = err instanceof Error ? err.message : String(err);
    }

    expect(threwOnFreeze).toBe(true);
    expect(thrownMessage).toMatch(/not yet available|point-in-time/i);
    expect(predictionId).toBeNull();

    if (!threwOnFreeze && predictionId) {
      const { data: snapshot } = await supabase
        .from("prediction_feature_snapshot")
        .select("feature_value_id")
        .eq("prediction_id", predictionId);
      console.log(`[F] UNEXPECTED: snapshot rows: ${snapshot?.length}`);
    }
  });
});
