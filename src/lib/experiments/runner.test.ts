import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { registerModel } from "@/lib/models/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { generateSyntheticLabeledDataset } from "./fixtures";
import { runBaselineExperiment } from "./runner";
import type { ExperimentConfig } from "./types";

const BOUNDARIES = {
  trainStart: "2025-01-01T00:00:00.000Z",
  trainEnd: "2025-06-01T00:00:00.000Z",
  validationStart: "2025-06-01T00:00:00.000Z",
  validationEnd: "2025-08-01T00:00:00.000Z",
  testStart: "2025-08-01T00:00:00.000Z",
  testEnd: "2025-10-01T00:00:00.000Z",
};

describe("experiments/runner", () => {
  const supabase = createServiceRoleClient();
  const experimentIds: string[] = [];
  let modelId: string;

  afterAll(async () => {
    for (const id of experimentIds) {
      await supabase.from("experiment_runs").delete().eq("experiment_id", id);
      await supabase.from("experiments").delete().eq("id", id);
    }
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
  });

  it("persists a full experiment run with typed columns, and never decides PRODUCTION", async () => {
    modelId = await registerModel({
      code: `RUNNER_TEST_MODEL_${randomUUID().slice(0, 8)}`,
      name: "Runner Test Model",
      modelType: "LOGISTIC",
    });

    const rows = generateSyntheticLabeledDataset(11, 6000, "2025-01-01T00:00:00.000Z", 0.05);
    const config: ExperimentConfig = {
      name: `Test experiment ${randomUUID().slice(0, 8)}`,
      hypothesis: "Momentum-like signal predicts next-period direction better than majority class.",
      seed: 11,
      boundaries: BOUNDARIES,
    };

    const result = await runBaselineExperiment(config, rows, modelId, { isMock: true });
    experimentIds.push(result.experimentId);

    expect(["PROMOTE_TO_SHADOW", "REJECT", "INCONCLUSIVE"]).toContain(result.promotionDecision);
    expect(result.promotionDecision).not.toMatch(/PRODUCTION/);

    const { data: experimentRow } = await supabase
      .from("experiments")
      .select("status, random_seed, train_start_date, test_end_date")
      .eq("id", result.experimentId)
      .single();
    expect(experimentRow?.status).toBe("PROMOTION_DECIDED");
    expect(experimentRow?.random_seed).toBe(11);
    expect(experimentRow?.train_start_date).toBe("2025-01-01");

    const { data: runRow } = await supabase
      .from("experiment_runs")
      .select("status, is_mock, train_row_count, test_row_count, promotion_decision")
      .eq("id", result.experimentRunId)
      .single();
    expect(runRow?.status).toBe("COMPLETE");
    expect(runRow?.is_mock).toBe(true);
    expect(runRow?.train_row_count).toBeGreaterThan(0);
    expect(runRow?.promotion_decision).toBe(result.promotionDecision);
  });

  it("the DB itself rejects a promotion_decision claiming to promote straight to production", async () => {
    const { data: experiment } = await supabase
      .from("experiments")
      .insert({ name: "constraint test", hypothesis: "n/a" })
      .select("id")
      .single();
    experimentIds.push(experiment!.id);

    const { error } = await supabase
      .from("experiment_runs")
      .insert({ experiment_id: experiment!.id, promotion_decision: "PROMOTE_TO_PRODUCTION" as never });

    expect(error).not.toBeNull();
  });
});
