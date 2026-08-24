import "server-only";

import { getConnectionSummary } from "@/lib/integrations/schwab/oauth";
import { SchwabMarketDataProvider } from "@/lib/integrations/schwab/market-data-provider";
import type { IngestionOutcome } from "@/lib/ingestion/types";

import { ingestMarketPrices } from "./providers/market-data";

/**
 * The one place PMNTx decides which market-data provider actually runs —
 * nothing else in the codebase should call SchwabMarketDataProvider or
 * the Alpha Vantage client directly for reference-price ingestion. Schwab
 * is tried first when connected (real-time capable, and the provider
 * PMNTx's own account is authenticated against); Alpha Vantage is the
 * fallback, exactly as it was before Schwab existed. Admin can still
 * disable either independently (Schwab via disconnect, Alpha Vantage via
 * Admin → Integrations), which is the "choice" lever for Phase 1A rather
 * than a full configurable-priority UI — see docs/NEXT_PHASE.md for that.
 */
export async function ingestDailyReferencePrices(tickers: string[]): Promise<IngestionOutcome> {
  const schwabConnection = await getConnectionSummary();

  if (schwabConnection.status === "CONNECTED") {
    let recordsIngested = 0;
    const failures: string[] = [];
    for (const ticker of tickers) {
      const result = await SchwabMarketDataProvider.getDailyPriceHistory(ticker);
      if (result.status === "NOT_CONFIGURED") break; // connection dropped mid-loop — fall through to Alpha Vantage for everything
      recordsIngested += result.recordsIngested;
      if (result.errorMessage) failures.push(`${ticker}: ${result.errorMessage}`);
    }
    if (recordsIngested > 0 || failures.length > 0) {
      return {
        status: failures.length === 0 ? "SUCCEEDED" : recordsIngested > 0 ? "PARTIAL" : "FAILED",
        recordsIngested,
        errorMessage: failures.join("; ") || undefined,
      };
    }
  }

  return ingestMarketPrices(tickers);
}
