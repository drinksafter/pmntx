import "server-only";

import { getDecryptedCredential } from "@/lib/credentials/store";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrCreateSecurityByTicker } from "@/lib/ingestion/securities";
import { completeIngestionRun, startIngestionRun } from "@/lib/ingestion/runs";
import type { IngestionOutcome } from "@/lib/ingestion/types";

// Concrete implementation: Alpha Vantage TIME_SERIES_DAILY. The
// MARKET_DATA integration is provider-agnostic by design (docs/PHASE_1A_PLAN.md
// §5 — "provider configurable in Admin"); swapping vendors means a new file
// implementing the same ingestMarketPrices signature, not a schema change.
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

type AlphaVantageDailyResponse = {
  "Time Series (Daily)"?: Record<
    string,
    { "1. open": string; "2. high": string; "3. low": string; "4. close": string; "5. volume": string }
  >;
  "Error Message"?: string;
  Note?: string;
};

/**
 * Fetches and stores the most recent daily OHLCV bar for each ticker.
 * Returns NOT_CONFIGURED (no ingestion run recorded) if no credential is
 * saved yet — callers should treat that the same as any other disabled
 * pipeline stage, not an error.
 */
export async function ingestMarketPrices(tickers: string[]): Promise<IngestionOutcome> {
  const apiKey = await getDecryptedCredential("MARKET_DATA");
  if (!apiKey) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

  const runId = await startIngestionRun("MARKET_DATA");
  const supabase = createServiceRoleClient();

  let recordsIngested = 0;
  const failures: string[] = [];

  for (const ticker of tickers) {
    try {
      const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
        ticker
      )}&apikey=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as AlphaVantageDailyResponse;
      if (data["Error Message"] || data.Note) {
        throw new Error(data["Error Message"] ?? data.Note ?? "Unknown Alpha Vantage error.");
      }

      const series = data["Time Series (Daily)"];
      const latestDate = series ? Object.keys(series).sort().at(-1) : undefined;
      if (!series || !latestDate) throw new Error("No time series data returned.");

      const bar = series[latestDate];
      const securityId = await getOrCreateSecurityByTicker(ticker);

      const { error } = await supabase.from("market_prices").upsert(
        {
          security_id: securityId,
          price_date: latestDate,
          open: Number(bar["1. open"]),
          high: Number(bar["2. high"]),
          low: Number(bar["3. low"]),
          close: Number(bar["4. close"]),
          volume: Number(bar["5. volume"]),
          source: "ALPHA_VANTAGE",
        },
        { onConflict: "security_id,price_date,source" }
      );

      if (error) throw error;
      recordsIngested += 1;
    } catch (err) {
      failures.push(`${ticker}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const status = failures.length === 0 ? "SUCCEEDED" : recordsIngested > 0 ? "PARTIAL" : "FAILED";
  await completeIngestionRun(runId, status, recordsIngested, failures.join("; ") || undefined);

  return { status, recordsIngested, errorMessage: failures.join("; ") || undefined };
}
