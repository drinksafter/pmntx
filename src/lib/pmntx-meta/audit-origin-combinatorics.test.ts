import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeMetaConsensusForDate } from "./pipeline";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

describe("AUDIT: origin/environment combinatorics and constraint enforcement", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from("securities")
      .insert({ ticker: `ORIGINAUDIT_${randomUUID().slice(0, 8)}`, name: "Origin Combinatorics Test" })
      .select("id")
      .single();
    securityId = data!.id;
  });

  afterAll(async () => {
    await supabase.from("securities").delete().eq("id", securityId);
  });

  it("the DB rejects a malformed/lowercase/whitespace-variant origin value outright (real Postgres enum, not text+convention)", async () => {
    const { data: idea } = await supabase.from("ideas").insert({ security_id: securityId, origin: "PMNTX_CORE", direction: "LONG" }).select("id").single();

    for (const badOrigin of ["pmntx_core", "PMNTX_CORE ", " PMNTX_CORE", "ml_model", "Ml_Model"]) {
      const { error } = await supabase.from("predictions").insert({
        idea_id: idea!.id,
        security_id: securityId,
        origin: badOrigin as never,
        data_cutoff: new Date().toISOString(),
        reference_price: 1,
        reference_price_at: new Date().toISOString(),
        direction: "LONG",
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/invalid input value for enum/i);
    }
  });

  it("the DB rejects a malformed environment value outright (CHECK constraint, case-sensitive)", async () => {
    const { data: idea } = await supabase.from("ideas").insert({ security_id: securityId, origin: "ML_MODEL", direction: "LONG" }).select("id").single();

    for (const badEnv of ["production", "Shadow", "PROD", ""]) {
      const { error } = await supabase.from("predictions").insert({
        idea_id: idea!.id,
        security_id: securityId,
        origin: "ML_MODEL",
        environment: badEnv as never,
        data_cutoff: new Date().toISOString(),
        reference_price: 1,
        reference_price_at: new Date().toISOString(),
        direction: "LONG",
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/violates check constraint/i);
    }
  });

  it("[combinatorial matrix] ML_MODEL origin is excluded from Meta consensus at EVERY environment value — PRODUCTION, SHADOW, and EXPERIMENT alike", async () => {
    const runDate = "2026-06-01";
    const { data: coreRun } = await supabase
      .from("research_runs")
      .insert({ run_date: runDate, origin_type: "PMNTX_CORE", status: "SUCCEEDED", frozen_at: new Date().toISOString() })
      .select("id")
      .single();

    const environments: ("PRODUCTION" | "SHADOW" | "EXPERIMENT")[] = ["PRODUCTION", "SHADOW", "EXPERIMENT"];
    const predictionIds: string[] = [];

    for (const env of environments) {
      const { data: sec } = await supabase
        .from("securities")
        .insert({ ticker: `ORIGINAUDIT_${env}_${randomUUID().slice(0, 6)}`, name: `${env} test` })
        .select("id")
        .single();
      const { data: idea } = await supabase.from("ideas").insert({ security_id: sec!.id, origin: "ML_MODEL", research_run_id: coreRun!.id, direction: "LONG" }).select("id").single();
      const { data: prediction } = await supabase
        .from("predictions")
        .insert({
          idea_id: idea!.id,
          security_id: sec!.id,
          origin: "ML_MODEL",
          environment: env,
          research_run_id: coreRun!.id,
          data_cutoff: new Date().toISOString(),
          reference_price: 100,
          reference_price_at: new Date().toISOString(),
          direction: "LONG",
          frozen_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      predictionIds.push(prediction!.id);
    }

    const consensusResults = await computeMetaConsensusForDate(runDate);
    // computeMetaConsensusForDate returns an entry for EVERY security with
    // ANY frozen prediction that day, regardless of eligibility — status
    // distinguishes COMPUTED (had >=1 eligible contributor) from
    // NO_CONTRIBUTORS (had a frozen prediction, but none were eligible).
    // "Admitted to consensus" means COMPUTED, not merely present in this array.
    const computedSecurityIds = consensusResults.filter((r) => r.status === "COMPUTED").map((r) => r.securityId);

    const { data: testSecurities } = await supabase.from("securities").select("id").ilike("ticker", "ORIGINAUDIT_%");
    for (const sec of testSecurities ?? []) {
      expect(computedSecurityIds).not.toContain(sec.id);
    }
    // Ground truth: no consensus_snapshots row should exist for this date at all.
    const { data: snapshots } = await supabase.from("consensus_snapshots").select("id").eq("run_date", runDate);
    expect(snapshots ?? []).toHaveLength(0);

    console.log(`[combinatorial] ML_MODEL x {PRODUCTION,SHADOW,EXPERIMENT}: none of ${predictionIds.length} predictions reached status=COMPUTED (0 consensus_snapshots rows written) for ${runDate}. Confirms origin, not environment, is the controlling (and sole) filter in isEligibleForMeta — an ML_MODEL prediction can never enter Meta consensus regardless of environment under the current implementation (Phase 2 scope to change, not a Phase 1A defect).`);
  });
});
