import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { writeFeatureValues } from "./store";
import type { FeatureFamily, FeatureValueInput } from "./types";

/**
 * Derives RETURNS/MOMENTUM feature values from the existing `market_prices`
 * table (fed by Schwab and/or Alpha Vantage — see src/lib/ingestion/) for
 * one security, over its full available history. `available_at` is set to
 * end-of-day on each bar's `price_date`, matching how `market_prices` rows
 * become knowable in practice (a daily close, known after that day ends).
 *
 * This is the one feature family implemented for real this phase, per
 * the pivot brief §5's "support future families without fully
 * implementing them all." VOLATILITY/VOLUME_LIQUIDITY/RELATIVE_STRENGTH/
 * FUNDAMENTALS/EARNINGS/VALUATION/SECTOR_INDUSTRY/MACRO_RATES/
 * ALTERNATIVE_DATA/OPTIONS_DERIVED are typed in FeatureFamily but have no
 * ingestion adapter yet — deferred, not silently skipped.
 */
export async function ingestReturnsMomentumFromMarketPrices(securityId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data: bars, error } = await supabase
    .from("market_prices")
    .select("price_date, close")
    .eq("security_id", securityId)
    .order("price_date", { ascending: true });
  if (error) throw error;
  if (!bars || bars.length < 21) return 0; // need at least 20d history for momentum

  const values: (FeatureValueInput & { family: FeatureFamily })[] = [];

  for (let i = 5; i < bars.length; i++) {
    const observationAt = `${bars[i].price_date}T23:59:59.000Z`;
    const ret5d = (Number(bars[i].close) - Number(bars[i - 5].close)) / Number(bars[i - 5].close);
    values.push({
      featureCode: "RETURN_5D",
      family: "RETURNS",
      securityId,
      value: ret5d,
      observationAt,
      availableAt: observationAt,
      source: "market_prices",
    });
  }
  for (let i = 20; i < bars.length; i++) {
    const observationAt = `${bars[i].price_date}T23:59:59.000Z`;
    const momentum20d = (Number(bars[i].close) - Number(bars[i - 20].close)) / Number(bars[i - 20].close);
    values.push({
      featureCode: "MOMENTUM_20D",
      family: "MOMENTUM",
      securityId,
      value: momentum20d,
      observationAt,
      availableAt: observationAt,
      source: "market_prices",
    });
  }

  await writeFeatureValues(values);
  return values.length;
}
