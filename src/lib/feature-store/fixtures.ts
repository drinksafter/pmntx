import { createSeededRandom } from "@/lib/testing/deterministic-random";

import type { FeatureFamily, FeatureValueInput } from "./types";

/**
 * Deterministic synthetic daily closing prices for one security starting
 * `days` calendar days before `endDateIso`. Same seed -> same prices,
 * every time — used by the feature-store adapter, the experiment
 * framework, and the vertical-slice test so none of them need live
 * market data.
 */
export function generateSyntheticDailyPrices(
  seed: number,
  endDateIso: string,
  days: number
): { date: string; close: number }[] {
  const random = createSeededRandom(seed);
  const prices: { date: string; close: number }[] = [];
  let price = 100;
  const end = new Date(endDateIso);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - i);
    price = Math.max(1, price * (1 + (random() - 0.5) * 0.04));
    prices.push({ date: date.toISOString().slice(0, 10), close: Number(price.toFixed(2)) });
  }
  return prices;
}

/**
 * Derives RETURN_5D / MOMENTUM_20D feature-value inputs from a synthetic
 * price series, correctly setting `available_at` to end-of-day on the
 * observation date (a same-day close is knowable by the next data refresh,
 * not before) — this is the fixture used to prove point-in-time filtering
 * actually works, not just that the query syntax is correct.
 */
export function deriveReturnMomentumFeatures(
  securityId: string,
  prices: { date: string; close: number }[]
): (FeatureValueInput & { family: FeatureFamily })[] {
  const values: (FeatureValueInput & { family: FeatureFamily })[] = [];

  for (let i = 5; i < prices.length; i++) {
    const observationAt = `${prices[i].date}T23:59:59.000Z`;
    const ret5d = (prices[i].close - prices[i - 5].close) / prices[i - 5].close;
    values.push({
      featureCode: "RETURN_5D",
      family: "RETURNS",
      securityId,
      value: ret5d,
      observationAt,
      availableAt: observationAt,
      source: "SYNTHETIC_FIXTURE",
    });
  }

  for (let i = 20; i < prices.length; i++) {
    const observationAt = `${prices[i].date}T23:59:59.000Z`;
    const momentum20d = (prices[i].close - prices[i - 20].close) / prices[i - 20].close;
    values.push({
      featureCode: "MOMENTUM_20D",
      family: "MOMENTUM",
      securityId,
      value: momentum20d,
      observationAt,
      availableAt: observationAt,
      source: "SYNTHETIC_FIXTURE",
    });
  }

  return values;
}
