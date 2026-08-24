import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOrCreateSecurityByTicker } from "@/lib/ingestion/securities";
import { completeIngestionRun, startIngestionRun } from "@/lib/ingestion/runs";
import type { IngestionOutcome } from "@/lib/ingestion/types";

import { SCHWAB_API_BASE_URL } from "./config";
import { getValidAccessToken } from "./oauth";

// Endpoint paths below follow the commonly-documented Schwab Trader API
// market-data shape (marketdata/v1/...) per docs/SCHWAB_INTEGRATION.md —
// NOT independently confirmed against the primary docs (developer.schwab.com
// blocked automated fetches). Verify against a real registered app's
// working requests before trusting these paths in production; if they're
// wrong, every call below fails loudly (a non-2xx response), not silently.
const QUOTES_PATH = "/marketdata/v1/quotes";
const PRICE_HISTORY_PATH = "/marketdata/v1/pricehistory";

type SchwabQuoteResponse = Record<
  string,
  {
    quote?: {
      lastPrice?: number;
      bidPrice?: number;
      askPrice?: number;
      totalVolume?: number;
      quoteTime?: number; // epoch ms, per common Schwab/TDA convention
    };
  }
>;

/**
 * `SchwabMarketDataProvider` — one of potentially several MarketDataProvider
 * implementations (see src/lib/ingestion/providers/market-data.ts for the
 * Alpha Vantage one). Nothing in PMNTx is hard-coded to Schwab; see
 * src/lib/ingestion/market-data-router.ts for how the two are prioritized.
 */
export const SchwabMarketDataProvider = {
  /** Real-time (or best-available) quotes for up to a handful of symbols in one call. Writes schwab_quotes, not market_prices — see freshness.ts for why real-time quotes get their own table. */
  async getQuotes(symbols: string[]): Promise<IngestionOutcome> {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

    const supabase = createServiceRoleClient();
    const runId = await startIngestionRun("MARKET_DATA");
    let recordsIngested = 0;
    const failures: string[] = [];

    try {
      const url = `${SCHWAB_API_BASE_URL}${QUOTES_PATH}?symbols=${encodeURIComponent(symbols.join(","))}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as SchwabQuoteResponse;
      await supabase.from("schwab_connection").update({ last_market_data_request_at: new Date().toISOString() }).eq("id", true);

      for (const symbol of symbols) {
        const quote = data[symbol]?.quote;
        if (!quote) {
          failures.push(`${symbol}: no quote in response`);
          continue;
        }

        const securityId = await getOrCreateSecurityByTicker(symbol);
        const quoteTimestamp = quote.quoteTime ? new Date(quote.quoteTime).toISOString() : new Date().toISOString();

        const { error } = await supabase.from("schwab_quotes").insert({
          symbol,
          security_id: securityId,
          last_price: quote.lastPrice ?? null,
          bid: quote.bidPrice ?? null,
          ask: quote.askPrice ?? null,
          volume: quote.totalVolume ?? null,
          quote_timestamp: quoteTimestamp,
          raw: quote,
        });
        if (error) throw error;
        recordsIngested += 1;
      }
    } catch (err) {
      failures.push(err instanceof Error ? err.message : "Unknown Schwab quotes error.");
    }

    const status = failures.length === 0 ? "SUCCEEDED" : recordsIngested > 0 ? "PARTIAL" : "FAILED";
    await completeIngestionRun(runId, status, recordsIngested, failures.join("; ") || undefined);
    return { status, recordsIngested, errorMessage: failures.join("; ") || undefined };
  },

  /** Daily bars for one symbol — written to the existing market_prices table (source='SCHWAB'), the same table Alpha Vantage feeds, so downstream code (reference prices, outcome resolution) doesn't need to know which provider supplied a given day's bar. */
  async getDailyPriceHistory(symbol: string): Promise<IngestionOutcome> {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

    const supabase = createServiceRoleClient();
    const runId = await startIngestionRun("MARKET_DATA");

    try {
      const url = `${SCHWAB_API_BASE_URL}${PRICE_HISTORY_PATH}?symbol=${encodeURIComponent(symbol)}&periodType=month&period=1&frequencyType=daily&frequency=1`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { candles?: { datetime: number; open: number; high: number; low: number; close: number; volume: number }[] };
      const candles = data.candles ?? [];
      if (candles.length === 0) {
        await completeIngestionRun(runId, "FAILED", 0, "No candles returned.");
        return { status: "FAILED", recordsIngested: 0, errorMessage: "No candles returned." };
      }

      const securityId = await getOrCreateSecurityByTicker(symbol);
      let recordsIngested = 0;
      for (const candle of candles) {
        const { error } = await supabase.from("market_prices").upsert(
          {
            security_id: securityId,
            price_date: new Date(candle.datetime).toISOString().slice(0, 10),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            source: "SCHWAB",
          },
          { onConflict: "security_id,price_date,source" }
        );
        if (error) throw error;
        recordsIngested += 1;
      }

      await completeIngestionRun(runId, "SUCCEEDED", recordsIngested);
      return { status: "SUCCEEDED", recordsIngested };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown Schwab price history error.";
      await completeIngestionRun(runId, "FAILED", 0, errorMessage);
      return { status: "FAILED", recordsIngested: 0, errorMessage };
    }
  },
};
