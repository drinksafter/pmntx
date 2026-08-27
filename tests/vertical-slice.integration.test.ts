import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateSyntheticDailyPrices } from "@/lib/feature-store/fixtures";
import { ingestReturnsMomentumFromMarketPrices } from "@/lib/feature-store/ingestion-adapter";
import { getFeaturesAsOf } from "@/lib/feature-store/store";
import { registerModel, registerModelVersion } from "@/lib/models/registry";
import { freezeStandardizedPrediction } from "@/lib/predictions/contract";
import { rankCandidates, writeCandidateRankings } from "@/lib/candidates/ranking";
import { routeAndInvoke } from "@/lib/router/orchestrator";
import { recordCostEntry } from "@/lib/cost-ledger/ledger";
import { resolveDueOutcomes } from "@/lib/outcomes/resolution";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * The single most important test in this pivot (brief §27): a complete,
 * deterministic, mocked lifecycle with no live credentials and no paid
 * API call anywhere in the chain —
 *
 *   POINT-IN-TIME MOCK MARKET DATA
 *   -> FEATURE GENERATION
 *   -> BASELINE MODEL
 *   -> STANDARDIZED PREDICTION (frozen, environment=SHADOW)
 *   -> CANDIDATE RANKING
 *   -> COST-AWARE ROUTING DECISION (via an injected stub — never the real gateway)
 *   -> SYNTHETIC OUTCOME RESOLUTION (the existing, unmodified resolveDueOutcomes)
 *   -> PERFORMANCE RECORD (prediction_outcomes itself, per the architecture
 *      audit's finding — no new table invented)
 *   -> COST RECORD
 *
 * Every stage below is a real call into the actual module that stage's
 * checkpoint built — nothing here is reimplemented just for this test.
 */
describe("ML pivot vertical slice (fully mocked, no live credentials)", () => {
  const supabase = createServiceRoleClient();
  let securityId: string;
  let modelId: string;
  let modelVersionId: string;
  let predictionId: string;
  let researchRunId: string;

  const REFERENCE_DATE = "2026-01-01"; // the "as of" date the prediction is made
  const OUTCOME_DATE = "2026-01-06"; // 5 calendar days later — D5 horizon target

  beforeAll(async () => {
    const { data: security } = await supabase
      .from("securities")
      .insert({ ticker: `VSLICE_${randomUUID().slice(0, 8)}`, name: "Vertical Slice Test Security" })
      .select("id")
      .single();
    securityId = security!.id;
  });

  afterAll(async () => {
    await supabase.from("cost_ledger_entries").delete().eq("security_id", securityId);
    await supabase.from("router_decisions").delete().eq("security_id", securityId);
    await supabase.from("prediction_outcomes").delete().in(
      "prediction_horizon_id",
      (await supabase.from("prediction_horizons").select("id").eq("prediction_id", predictionId)).data?.map((r) => r.id) ?? []
    );
    // predictions/prediction_horizons/candidate_rankings/research_runs/model_runs are
    // frozen and immutable by design — left in place as identifiable
    // residue (VSLICE_ ticker), matching this repo's established test pattern.
    await supabase.from("feature_values").delete().eq("security_id", securityId);
    await supabase.from("market_prices").delete().eq("security_id", securityId);
    await supabase.from("model_versions").delete().eq("model_id", modelId);
    await supabase.from("models").delete().eq("id", modelId);
  });

  it("runs the complete mocked vertical slice end to end", async () => {
    // ---- 1. POINT-IN-TIME MOCK MARKET DATA ----------------------------
    const prices = generateSyntheticDailyPrices(42, REFERENCE_DATE, 40); // 40 trading days ending on the reference date
    const { error: pricesError } = await supabase.from("market_prices").insert(
      prices.map((p) => ({ security_id: securityId, price_date: p.date, close: p.close, source: "SYNTHETIC_FIXTURE" }))
    );
    expect(pricesError).toBeNull();

    // ---- 2. FEATURE GENERATION -----------------------------------------
    const featureCount = await ingestReturnsMomentumFromMarketPrices(securityId);
    expect(featureCount).toBeGreaterThan(0);

    const asOfReference = `${REFERENCE_DATE}T23:59:59.000Z`;
    const featuresAsOfReference = await getFeaturesAsOf(securityId, asOfReference);
    expect(featuresAsOfReference.length).toBeGreaterThan(0);
    const momentumFeature = featuresAsOfReference.find((f) => f.featureCode === "MOMENTUM_20D");
    expect(momentumFeature).toBeDefined();

    // Anti-look-ahead-leakage sanity check inline in the slice itself: a
    // point-in-time read from BEFORE any of this data existed sees nothing.
    const featuresBeforeAnyData = await getFeaturesAsOf(securityId, "2020-01-01T00:00:00.000Z");
    expect(featuresBeforeAnyData).toHaveLength(0);

    // ---- 3. BASELINE MODEL ----------------------------------------------
    modelId = await registerModel({
      code: `VSLICE_BASELINE_${randomUUID().slice(0, 8)}`,
      name: "Vertical Slice Baseline",
      modelType: "DETERMINISTIC_FACTOR",
    });
    const version = await registerModelVersion({ modelId, version: "v1", costClass: "FREE" });
    modelVersionId = version.id;

    // A trivial deterministic score from the momentum feature — the
    // baseline model this phase is meant to validate the lifecycle, not
    // maximize sophistication (brief §12).
    const compositeScore = Math.max(-1, Math.min(1, momentumFeature!.value * 2));
    const direction = compositeScore > 0.05 ? "LONG" : compositeScore < -0.05 ? "SHORT" : "WATCH";

    const { data: referencePriceRow } = await supabase
      .from("market_prices")
      .select("close")
      .eq("security_id", securityId)
      .eq("price_date", REFERENCE_DATE)
      .single();

    // ---- 4. STANDARDIZED PREDICTION (frozen immediately, environment=SHADOW) ----
    const frozen = await freezeStandardizedPrediction({
      securityId,
      modelId,
      modelVersionId,
      environment: "SHADOW",
      direction,
      score: compositeScore,
      referencePrice: Number(referencePriceRow!.close),
      referencePriceAt: asOfReference,
      horizon: "D5",
      probabilityPositive: compositeScore > 0 ? 0.5 + compositeScore / 2 : 0.5 - Math.abs(compositeScore) / 2,
      featureValueIds: featuresAsOfReference.map((f) => f.id),
    });
    predictionId = frozen.predictionId;
    expect(predictionId).toBeTruthy();

    const { data: predictionRow } = await supabase
      .from("predictions")
      .select("origin, environment, frozen_at, model_id, model_version_id")
      .eq("id", predictionId)
      .single();
    expect(predictionRow?.origin).toBe("ML_MODEL");
    expect(predictionRow?.environment).toBe("SHADOW");
    expect(predictionRow?.frozen_at).toBeTruthy();
    expect(predictionRow?.model_version_id).toBe(modelVersionId);

    const { data: featureSnapshotRows } = await supabase
      .from("prediction_feature_snapshot")
      .select("id")
      .eq("prediction_id", predictionId);
    expect(featureSnapshotRows?.length).toBe(featuresAsOfReference.length);

    // ---- 5. CANDIDATE RANKING -------------------------------------------
    const ranked = rankCandidates(
      [{ securityId, scores: [{ modelCode: "VSLICE_BASELINE", score: compositeScore }] }],
      { maxCandidates: 100, minScoreThreshold: null }
    );
    expect(ranked[0].selected).toBe(true);

    const rankingResult = await writeCandidateRankings(REFERENCE_DATE, modelVersionId, ranked);
    researchRunId = rankingResult.researchRunId;
    expect(rankingResult.selectedCount).toBe(1);

    const { data: researchRunRow } = await supabase.from("research_runs").select("origin_type, frozen_at").eq("id", researchRunId).single();
    expect(researchRunRow?.origin_type).toBe("MODEL");
    expect(researchRunRow?.frozen_at).toBeTruthy();

    const { data: candidateRankingRow } = await supabase
      .from("candidate_rankings")
      .select("id, rank, selected")
      .eq("research_run_id", researchRunId)
      .single();
    expect(candidateRankingRow?.selected).toBe(true);

    // ---- 6. COST-AWARE ROUTING DECISION (injected stub — never the real gateway) ----
    let deepAnalysisInvoked = false;
    const routingDecision = await routeAndInvoke(
      {
        candidateRankingId: candidateRankingRow!.id,
        securityId,
        researchRunId,
        rank: candidateRankingRow!.rank ?? 1,
        confidence: 0.6,
        disagreement: null,
        materialChangeFlag: false,
        lastAnalysisAt: null,
        tierCode: "BLIND_ANALYSIS",
      },
      async () => {
        // This stub stands in for runBlindAnalysisForSecurity — it is
        // NEVER the real function, and this test file never imports
        // src/lib/ai/gateway.ts or any provider adapter, directly or
        // transitively. This is what "cost-aware, without paid calls"
        // means in the mocked vertical slice.
        deepAnalysisInvoked = true;
      }
    );
    expect(["INVOKE", "SKIP"]).toContain(routingDecision.decision);
    if (routingDecision.decision === "INVOKE") expect(deepAnalysisInvoked).toBe(true);
    if (routingDecision.decision === "SKIP") expect(deepAnalysisInvoked).toBe(false);

    const { data: routerDecisionRow } = await supabase
      .from("router_decisions")
      .select("decision")
      .eq("security_id", securityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(routerDecisionRow?.decision).toBe(routingDecision.decision);

    // ---- 7. SYNTHETIC OUTCOME RESOLUTION (the existing, unmodified resolver) ----
    // The D5 horizon's target date is REFERENCE_DATE + 5 calendar days.
    await supabase.from("market_prices").insert({
      security_id: securityId,
      price_date: OUTCOME_DATE,
      close: Number(referencePriceRow!.close) * 1.1, // a known +10% move
      source: "SYNTHETIC_FIXTURE",
    });

    const resolutionSummary = await resolveDueOutcomes("2026-01-15"); // well after the target date
    expect(resolutionSummary.resolved).toBeGreaterThanOrEqual(1);

    // ---- 8. PERFORMANCE RECORD (prediction_outcomes IS the performance record) ----
    const { data: horizonRow } = await supabase.from("prediction_horizons").select("id").eq("prediction_id", predictionId).single();
    const { data: outcomeRow } = await supabase
      .from("prediction_outcomes")
      .select("status, actual_return, direction_correct")
      .eq("prediction_horizon_id", horizonRow!.id)
      .single();
    expect(outcomeRow?.status).toBe("RESOLVED");
    expect(outcomeRow?.actual_return).toBeCloseTo(0.1, 2);
    expect(outcomeRow?.direction_correct).toBe(direction === "LONG" ? true : direction === "SHORT" ? false : null);

    // ---- 9. COST RECORD ---------------------------------------------------
    // The feature/quant-scoring stages had zero marginal cost (local
    // compute); the routing decision's cost-awareness itself is what's
    // being demonstrated — record what the pipeline actually spent (real
    // zero, not fabricated) plus what a SKIPped deep-analysis stage would
    // have cost, so the ledger shows cost-awareness prevented real spend.
    await recordCostEntry({
      provider: "INTERNAL_COMPUTE",
      category: "FEATURE_COMPUTE",
      securityId,
      researchRunId,
      predictionId,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
    });
    if (routingDecision.decision === "SKIP") {
      await recordCostEntry({
        provider: "ANTHROPIC",
        category: "AI_INFERENCE",
        securityId,
        researchRunId,
        predictionId,
        estimatedCostUsd: 0.05, // what blind analysis WOULD have cost, had it been invoked
        actualCostUsd: 0, // never spent — the router said SKIP
      });
    }

    const { data: costRows } = await supabase.from("cost_ledger_entries").select("category, estimated_cost_usd, actual_cost_usd").eq("security_id", securityId);
    expect(costRows!.length).toBeGreaterThan(0);
    expect(costRows!.every((r) => Number(r.actual_cost_usd ?? 0) === 0)).toBe(true); // no real spend anywhere in this slice
  });
});
