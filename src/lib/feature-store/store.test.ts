import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { getFeaturesAsOf, writeFeatureValue } from "./store";

describe("feature-store/store", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  beforeAll(async () => {
    const { data, error } = await supabase
      .from("securities")
      .insert({ ticker: `FSTEST_${randomUUID().slice(0, 8)}`, name: "Feature Store Test Security" })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Failed to create test security.");
    securityId = data.id;
  });

  afterAll(async () => {
    await supabase.from("feature_values").delete().eq("security_id", securityId);
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("[property #1] excludes a future-dated feature from a historical reconstruction — no look-ahead leakage", async () => {
    // Observed and available far in the future relative to the query point.
    await writeFeatureValue({
      featureCode: "TEST_FUTURE_FEATURE",
      family: "MOMENTUM",
      securityId,
      value: 0.5,
      observationAt: "2030-01-01T00:00:00.000Z",
      availableAt: "2030-01-01T00:00:00.000Z",
      source: "test",
    });

    const asOf2025 = await getFeaturesAsOf(securityId, "2025-01-01T00:00:00.000Z", ["TEST_FUTURE_FEATURE"]);
    expect(asOf2025.find((f) => f.featureCode === "TEST_FUTURE_FEATURE")).toBeUndefined();

    const asOf2031 = await getFeaturesAsOf(securityId, "2031-01-01T00:00:00.000Z", ["TEST_FUTURE_FEATURE"]);
    expect(asOf2031.find((f) => f.featureCode === "TEST_FUTURE_FEATURE")).toBeDefined();
  });

  it("[property #2] respects available_at across revisions — a later-published revision of an earlier observation doesn't leak early", async () => {
    // A restated fact: observed on day 1, but not actually published/known until day 10.
    await writeFeatureValue({
      featureCode: "TEST_RESTATED_FEATURE",
      family: "FUNDAMENTALS",
      securityId,
      value: 1.0,
      observationAt: "2026-01-01T00:00:00.000Z",
      availableAt: "2026-01-10T00:00:00.000Z",
      source: "test",
    });

    const beforePublication = await getFeaturesAsOf(securityId, "2026-01-05T00:00:00.000Z", ["TEST_RESTATED_FEATURE"]);
    expect(beforePublication.find((f) => f.featureCode === "TEST_RESTATED_FEATURE")).toBeUndefined();

    const afterPublication = await getFeaturesAsOf(securityId, "2026-01-15T00:00:00.000Z", ["TEST_RESTATED_FEATURE"]);
    const found = afterPublication.find((f) => f.featureCode === "TEST_RESTATED_FEATURE");
    expect(found?.value).toBe(1.0);
  });

  it("returns the latest observation for a feature, not an older one, once both are available", async () => {
    await writeFeatureValue({
      featureCode: "TEST_LATEST_FEATURE",
      family: "VALUATION",
      securityId,
      value: 10,
      observationAt: "2026-02-01T00:00:00.000Z",
      availableAt: "2026-02-01T00:00:00.000Z",
      source: "test",
    });
    await writeFeatureValue({
      featureCode: "TEST_LATEST_FEATURE",
      family: "VALUATION",
      securityId,
      value: 20,
      observationAt: "2026-02-15T00:00:00.000Z",
      availableAt: "2026-02-15T00:00:00.000Z",
      source: "test",
    });

    const result = await getFeaturesAsOf(securityId, "2026-03-01T00:00:00.000Z", ["TEST_LATEST_FEATURE"]);
    expect(result.find((f) => f.featureCode === "TEST_LATEST_FEATURE")?.value).toBe(20);
  });

  it("the DB rejects a feature value whose available_at precedes its observation_at (impossible: known before it happened)", async () => {
    const { data: def } = await supabase
      .from("feature_definitions")
      .select("id")
      .eq("code", "TEST_LATEST_FEATURE")
      .single();

    const { error } = await supabase.from("feature_values").insert({
      feature_definition_id: def!.id,
      security_id: securityId,
      value: 1,
      observation_at: "2026-05-01T00:00:00.000Z",
      available_at: "2026-04-01T00:00:00.000Z", // before observation — impossible
      source: "test",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/available_at/i);
  });
});
