import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { freezeStandardizedPrediction } from "@/lib/predictions/contract";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { computePerformanceSummary } from "./queries";

describe("AUDIT: [FIXED — was: performance mixed SHADOW/PRODUCTION] computePerformanceSummary separates buckets by environment", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;
  const horizonIds: string[] = [];

  beforeAll(async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `PERFAUDIT_${randomUUID().slice(0, 8)}`, name: "Performance Env Separation Audit" })
      .select("id")
      .single();
    securityId = security!.id;

    modelId = await registerModel({ code: `PERFAUDIT_MODEL_${randomUUID().slice(0, 6)}`, name: "test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });
    modelVersionId = version.id;

    // Two predictions for the SAME model, same horizon, different environments.
    for (const environment of ["SHADOW", "EXPERIMENT"] as const) {
      const frozen = await freezeStandardizedPrediction({
        securityId,
        modelId,
        modelVersionId,
        environment,
        direction: "LONG",
        referencePrice: 100,
        referencePriceAt: "2026-01-01T00:00:00.000Z",
        horizon: "D5",
      });
      const { data: horizon } = await supabase.from("prediction_horizons").select("id").eq("prediction_id", frozen.predictionId).single();
      horizonIds.push(horizon!.id);
      await supabase.from("prediction_outcomes").upsert(
        {
          prediction_horizon_id: horizon!.id,
          status: "RESOLVED",
          actual_price: environment === "SHADOW" ? 110 : 90,
          actual_return: environment === "SHADOW" ? 0.1 : -0.1,
          direction_correct: environment === "SHADOW",
          resolved_at: new Date().toISOString(),
        },
        { onConflict: "prediction_horizon_id" }
      );
    }
  });

  afterAll(async () => {
    await supabase.from("prediction_outcomes").delete().in("prediction_horizon_id", horizonIds);
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
  });

  it("SHADOW and EXPERIMENT resolved outcomes for the same origin+horizon land in SEPARATE buckets, not mixed", async () => {
    const summary = await computePerformanceSummary();
    const mlModelBuckets = summary.filter((b) => b.origin === "ML_MODEL" && b.horizon === "D5");

    const shadowBucket = mlModelBuckets.find((b) => b.environment === "SHADOW");
    const experimentBucket = mlModelBuckets.find((b) => b.environment === "EXPERIMENT");

    expect(shadowBucket).toBeDefined();
    expect(experimentBucket).toBeDefined();
    expect(shadowBucket?.resolvedCount).toBe(1);
    expect(experimentBucket?.resolvedCount).toBe(1);
    expect(shadowBucket?.averageReturn).toBeCloseTo(0.1, 5);
    expect(experimentBucket?.averageReturn).toBeCloseTo(-0.1, 5);

    // The critical regression check: no single bucket averages the two
    // together (which would show ~0 and a hit rate of 50%, silently
    // hiding which environment actually performed how).
    expect(shadowBucket?.averageReturn).not.toBeCloseTo(experimentBucket?.averageReturn ?? 0, 2);
  });
});
