import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// A single default research horizon for Phase 1A. blind_analyses records
// each analyst's own forecast_horizons_supported, but revealed_analyses
// doesn't (see supabase/migrations/011_blind_reveal.sql), and reconciling
// varying per-analyst horizon lists into a real multi-horizon forecast
// needs a quant model this phase doesn't have yet — one row keeps the
// Prediction Warehouse populated honestly rather than fabricating
// coverage. See docs/NEXT_PHASE.md for real multi-horizon forecasting.
const DEFAULT_HORIZON = "D21";

export type PredictionFreezeResult = {
  securityId: string;
  status: "FROZEN" | "ALREADY_EXISTS" | "NO_REFERENCE_PRICE";
  predictionId?: string;
  message?: string;
};

/**
 * Synthesizes PMNTX Core's own ranking (the deterministic, primary
 * signal) with whatever AI analysis exists for a security into one frozen
 * prediction. Core's candidate_rankings.direction/score is always the
 * prediction's direction/score — blind/revealed analysis only supplies
 * supporting narrative (thesis/risks) and probability estimates when
 * available. This keeps a PMNTX_CORE prediction genuinely Core's own even
 * when paid AI is disabled, satisfying "deterministic PMNTX can continue
 * when paid AI is disabled" from the cost-guardrails work — a security
 * with zero AI analysis still gets a real prediction, just without
 * AI-derived narrative/probabilities.
 *
 * Never overwrites an existing prediction for this security+run — a
 * changed view is a new row via supersedes_prediction_id (not built yet;
 * see docs/NEXT_PHASE.md), not an edit to a frozen one.
 */
export async function freezePmntxCorePredictionForSecurity(
  researchRunId: string,
  securityId: string
): Promise<PredictionFreezeResult> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from("predictions")
    .select("id")
    .eq("research_run_id", researchRunId)
    .eq("security_id", securityId)
    .eq("origin", "PMNTX_CORE")
    .not("frozen_at", "is", null)
    .maybeSingle();
  if (existing) {
    return { securityId, status: "ALREADY_EXISTS", predictionId: existing.id, message: "Already frozen — never overwritten." };
  }

  const { data: ranking } = await supabase
    .from("candidate_rankings")
    .select("direction, score")
    .eq("research_run_id", researchRunId)
    .eq("security_id", securityId)
    .single();
  if (!ranking || !ranking.direction) {
    return { securityId, status: "NO_REFERENCE_PRICE", message: "No candidate_rankings row (or no direction) for this security in this run." };
  }

  const { data: latestPrice } = await supabase
    .from("market_prices")
    .select("close, price_date")
    .eq("security_id", securityId)
    .order("price_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestPrice) {
    return {
      securityId,
      status: "NO_REFERENCE_PRICE",
      message: "No market_prices row for this security — cannot set a reference price. Configure the market data integration.",
    };
  }

  // Prefer revealed analysis (identity-aware, the "final" view); fall back
  // to blind if no reveal exists yet; fall back to nothing (Core-only) if
  // neither AI stage produced a result.
  const { data: revealed } = await supabase
    .from("revealed_analyses")
    .select("reasoning, ai_execution_id, prompt_version_id, probabilities")
    .eq("security_id", securityId)
    .not("frozen_at", "is", null)
    .not("blind_analysis_id", "is", null)
    .order("created_at", { ascending: false });

  const { data: blind } = await supabase
    .from("blind_analyses")
    .select("reasoning, risk_factors, ai_execution_id, prompt_version_id, probabilities")
    .eq("research_run_id", researchRunId)
    .eq("security_id", securityId)
    .not("frozen_at", "is", null);

  const { data: topHunterSignal } = await supabase
    .from("hunter_results")
    .select("explanation")
    .eq("security_id", securityId)
    .order("as_of_date", { ascending: false })
    .order("confidence", { ascending: false })
    .limit(1)
    .maybeSingle();

  const narrativeSource = revealed && revealed.length > 0 ? revealed : null;
  const thesis = narrativeSource
    ? narrativeSource.map((r) => r.reasoning).filter(Boolean).join(" ")
    : (blind ?? []).map((b) => b.reasoning).filter(Boolean).join(" ") || null;
  const risks = (blind ?? []).map((b) => b.risk_factors).filter(Boolean).join(" ") || null;
  const catalysts = topHunterSignal?.explanation ?? null;

  const probabilitySource = narrativeSource ?? blind ?? [];
  const positiveValues = probabilitySource
    .map((r) => (r.probabilities as { positive?: number } | null)?.positive)
    .filter((v): v is number => typeof v === "number");
  const negativeValues = probabilitySource
    .map((r) => (r.probabilities as { negative?: number } | null)?.negative)
    .filter((v): v is number => typeof v === "number");
  const avgProbabilityPositive = positiveValues.length
    ? positiveValues.reduce((a, b) => a + b, 0) / positiveValues.length
    : null;
  const avgProbabilityNegative = negativeValues.length
    ? negativeValues.reduce((a, b) => a + b, 0) / negativeValues.length
    : null;

  const primaryAiExecutionId = narrativeSource?.[0]?.ai_execution_id ?? blind?.[0]?.ai_execution_id ?? null;
  const primaryPromptVersionId = narrativeSource?.[0]?.prompt_version_id ?? blind?.[0]?.prompt_version_id ?? null;

  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .insert({ security_id: securityId, origin: "PMNTX_CORE", research_run_id: researchRunId, direction: ranking.direction })
    .select("id")
    .single();
  if (ideaError || !idea) throw new Error(`Failed to create idea: ${ideaError?.message}`);

  const now = new Date().toISOString();
  const { data: prediction, error: predictionError } = await supabase
    .from("predictions")
    .insert({
      idea_id: idea.id,
      security_id: securityId,
      origin: "PMNTX_CORE",
      research_run_id: researchRunId,
      data_cutoff: now,
      reference_price: latestPrice.close,
      reference_price_at: new Date(latestPrice.price_date).toISOString(),
      direction: ranking.direction,
      score: ranking.score,
      score_version: "v1",
      thesis,
      catalysts,
      risks,
      ai_execution_id: primaryAiExecutionId,
      prompt_version_id: primaryPromptVersionId,
      frozen_at: now,
    })
    .select("id")
    .single();
  if (predictionError || !prediction) throw new Error(`Failed to create prediction: ${predictionError?.message}`);

  // confidence is intentionally omitted: with 0-2 analysts contributing,
  // there's no principled single figure to reduce them to yet.
  const { error: horizonError } = await supabase.from("prediction_horizons").insert({
    prediction_id: prediction.id,
    horizon: DEFAULT_HORIZON,
    forecast_type: "FORECAST",
    probability_positive: avgProbabilityPositive,
    probability_negative: avgProbabilityNegative,
  });
  if (horizonError) throw new Error(`Failed to create prediction_horizons: ${horizonError.message}`);

  return { securityId, status: "FROZEN", predictionId: prediction.id };
}

export type PredictionFreezeRunResult = { researchRunId: string; results: PredictionFreezeResult[] };

/** Freezes a PMNTX Core prediction for every selected candidate in a frozen research run. */
export async function freezePmntxCorePredictionsForResearchRun(researchRunId: string): Promise<PredictionFreezeRunResult> {
  const supabase = createServiceRoleClient();

  const { data: run } = await supabase.from("research_runs").select("frozen_at").eq("id", researchRunId).single();
  if (!run?.frozen_at) {
    throw new Error(`Cannot freeze predictions: research_run ${researchRunId} is not frozen yet.`);
  }

  const { data: candidates } = await supabase
    .from("candidate_rankings")
    .select("security_id")
    .eq("research_run_id", researchRunId)
    .eq("selected", true);

  const results: PredictionFreezeResult[] = [];
  for (const candidate of candidates ?? []) {
    results.push(await freezePmntxCorePredictionForSecurity(researchRunId, candidate.security_id));
  }
  return { researchRunId, results };
}
