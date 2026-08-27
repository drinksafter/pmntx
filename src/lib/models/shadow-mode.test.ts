import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeMetaConsensusForDate } from "@/lib/pmntx-meta/pipeline";
import { loadMorningBrief } from "@/lib/morning-brief/queries";
import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { freezeStandardizedPrediction } from "@/lib/predictions/contract";
import { writeCandidateRankings, rankCandidates } from "@/lib/candidates/ranking";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * [Property #15 — SHADOW predictions cannot influence production].
 * Empirically creates a MODEL-origin research_run, a SHADOW-environment
 * prediction with origin='ML_MODEL', and asserts it is invisible to the
 * UNMODIFIED loadMorningBrief() and computeMetaConsensusForDate() — not
 * by inspecting their source, but by actually calling them and checking
 * the shadow candidate never appears in either result.
 */
describe("models/shadow-mode", () => {
  const supabase = createServiceRoleClient();
  const RUN_DATE = "2026-02-15"; // a date unlikely to collide with other tests' fixtures
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;

  beforeAll(async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `SHADOWTEST_${randomUUID().slice(0, 8)}`, name: "Shadow Mode Test Security" })
      .select("id")
      .single();
    securityId = security!.id;

    modelId = await registerModel({ code: `SHADOWTEST_MODEL_${randomUUID().slice(0, 8)}`, name: "Test", modelType: "LOGISTIC" });
    const version = await registerModelVersion({ modelId, version: "v1" });
    modelVersionId = version.id;

    const ranked = rankCandidates(
      [{ securityId, scores: [{ modelCode: "TEST", score: 0.9 }] }], // deliberately a very strong score
      { maxCandidates: 100, minScoreThreshold: null }
    );
    await writeCandidateRankings(RUN_DATE, modelVersionId, ranked);

    await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "SHADOW",
      direction: "LONG",
      score: 0.9,
      referencePrice: 100,
      referencePriceAt: new Date().toISOString(),
      horizon: "D21",
    });
  });

  afterAll(async () => {
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
    await supabase.from("feature_values").delete().eq("security_id", securityId);
    // predictions/candidate_rankings/research_runs are frozen and
    // immutable by design — left as identifiable residue (SHADOWTEST_ ticker).
  });

  it("a SHADOW/ML_MODEL prediction never appears in loadMorningBrief()'s Core or agent picks", async () => {
    const brief = await loadMorningBrief(supabase as never);
    const allPickedSecurityIds = [...brief.corePicks.map((p) => p.securityId), ...brief.agentPicks.map((p) => p.securityId)];
    expect(allPickedSecurityIds).not.toContain(securityId);
  });

  it("a SHADOW/ML_MODEL prediction never appears in PMNTx Meta's consensus for the same date", async () => {
    const consensusResults = await computeMetaConsensusForDate(RUN_DATE);
    expect(consensusResults.find((r) => r.securityId === securityId)).toBeUndefined();
  });
});
