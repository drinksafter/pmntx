export type QuoteFreshness = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

// Thresholds are intentionally conservative and Phase-1A-simple: a quote
// timestamped within the last minute is LIVE, within 15 minutes is
// DELAYED (matches the common "15-minute delayed" retail market-data
// convention), and older than that is STALE — old enough that using it
// as a reference price without a fresh check would misrepresent the data
// as current. "PMNTx should never silently treat stale market data as
// current" (build brief) is enforced by callers checking this before use,
// not by this function itself deciding what's acceptable for a given use.
const LIVE_THRESHOLD_MS = 60 * 1000;
const DELAYED_THRESHOLD_MS = 15 * 60 * 1000;

/** Derived at read time from the quote's own timestamp — never stored, so the freshness label can't itself go stale. */
export function computeFreshness(quoteTimestamp: string | null, now: Date = new Date()): QuoteFreshness {
  if (!quoteTimestamp) return "UNAVAILABLE";

  const quoteTime = new Date(quoteTimestamp).getTime();
  if (Number.isNaN(quoteTime)) return "UNAVAILABLE";

  const ageMs = now.getTime() - quoteTime;
  if (ageMs < 0) return "UNAVAILABLE"; // a quote timestamped in the future is untrustworthy, not "extra live"
  if (ageMs <= LIVE_THRESHOLD_MS) return "LIVE";
  if (ageMs <= DELAYED_THRESHOLD_MS) return "DELAYED";
  return "STALE";
}
