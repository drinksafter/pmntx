import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Phase 1A has no populated market_calendar (see migration 003) to count
// real trading days, so D*/Y* horizons are resolved as calendar-day
// offsets from reference_price_at — an approximation, not exact trading-
// day counting. Documented limitation, not silently wrong.
const HORIZON_DAYS: Record<string, number> = {
  D1: 1, D5: 5, D10: 10, D21: 21, D63: 63, D126: 126,
  Y1: 365, Y2: 730, Y3: 1095, Y5: 1825,
};

export type OutcomeResolutionSummary = {
  checked: number;
  resolved: number;
  notYetDue: number;
  dueButNoDataYet: number;
};

/**
 * Attaches outcomes to already-frozen predictions without ever touching
 * the predictions themselves — prediction_outcomes has no frozen_at gate
 * because it's written AFTER freeze, as horizons mature (see migration
 * 010's comment). A horizon whose target date hasn't arrived, or has
 * arrived but has no market_prices row yet, stays unresolved rather than
 * guessing — outcome resolution never uses information from after the
 * fact to backfill a plausible-looking number.
 */
export async function resolveDueOutcomes(asOfDate: string = new Date().toISOString().slice(0, 10)): Promise<OutcomeResolutionSummary> {
  const supabase = createServiceRoleClient();

  const { data: horizons } = await supabase.from("prediction_horizons").select("id, horizon, prediction_id");
  const { data: existingResolved } = await supabase
    .from("prediction_outcomes")
    .select("prediction_horizon_id")
    .eq("status", "RESOLVED");
  const resolvedIds = new Set((existingResolved ?? []).map((o) => o.prediction_horizon_id));

  const unresolvedHorizons = (horizons ?? []).filter((h) => !resolvedIds.has(h.id));
  if (unresolvedHorizons.length === 0) {
    return { checked: 0, resolved: 0, notYetDue: 0, dueButNoDataYet: 0 };
  }

  const predictionIds = [...new Set(unresolvedHorizons.map((h) => h.prediction_id))];
  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, security_id, reference_price, reference_price_at, direction, frozen_at")
    .in("id", predictionIds);
  const predictionById = new Map((predictions ?? []).map((p) => [p.id, p]));

  let resolved = 0;
  let notYetDue = 0;
  let dueButNoDataYet = 0;

  for (const horizonRow of unresolvedHorizons) {
    const prediction = predictionById.get(horizonRow.prediction_id);
    const horizonDays = HORIZON_DAYS[horizonRow.horizon];
    if (!prediction?.frozen_at || !horizonDays) {
      notYetDue++;
      continue;
    }

    const targetDate = new Date(prediction.reference_price_at);
    targetDate.setUTCDate(targetDate.getUTCDate() + horizonDays);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    if (targetDateStr > asOfDate) {
      notYetDue++;
      continue;
    }

    const { data: futurePrice } = await supabase
      .from("market_prices")
      .select("close, price_date")
      .eq("security_id", prediction.security_id)
      .gte("price_date", targetDateStr)
      .order("price_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!futurePrice) {
      dueButNoDataYet++;
      continue;
    }

    const actualReturn = (Number(futurePrice.close) - Number(prediction.reference_price)) / Number(prediction.reference_price);
    const directionCorrect =
      prediction.direction === "LONG" ? actualReturn > 0 : prediction.direction === "SHORT" ? actualReturn < 0 : null;

    const { error } = await supabase.from("prediction_outcomes").upsert(
      {
        prediction_horizon_id: horizonRow.id,
        status: "RESOLVED",
        actual_price: futurePrice.close,
        actual_return: actualReturn,
        direction_correct: directionCorrect,
        resolved_at: new Date().toISOString(),
      },
      { onConflict: "prediction_horizon_id" }
    );
    if (error) throw new Error(`Failed to upsert prediction_outcomes: ${error.message}`);
    resolved++;
  }

  return { checked: unresolvedHorizons.length, resolved, notYetDue, dueButNoDataYet };
}
