import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Looks up a security by ticker, creating a minimal row if this is the
 * first time any ingestion service has seen it. Provider clients call this
 * before writing market_prices/source_records so foreign keys always
 * resolve — the row gets enriched (name, sector, exchange) by whichever
 * source has that detail, not necessarily the first one to see the ticker.
 */
export async function getOrCreateSecurityByTicker(ticker: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const normalized = ticker.trim().toUpperCase();

  // securities' unique constraint is (ticker, exchange), and Postgres treats
  // NULL exchange values as distinct — so this can't safely use .single()/
  // .maybeSingle(). Ingestion jobs run one at a time in Phase 1A, so taking
  // the earliest match is deterministic in practice even though it doesn't
  // fully prevent a race from creating a duplicate.
  const { data: existing } = await supabase
    .from("securities")
    .select("id")
    .eq("ticker", normalized)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error } = await supabase
    .from("securities")
    .insert({ ticker: normalized, name: normalized })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create security for ticker "${normalized}": ${error?.message}`);
  }

  return created.id;
}

/**
 * Looks up a security by CIK, for sources (SEC EDGAR) keyed by CIK rather
 * than ticker. Returns null rather than creating a row — unlike
 * getOrCreateSecurityByTicker, we have no ticker/name to create a useful
 * placeholder with, and Phase 1A has no CIK<->ticker crosswalk ingestion
 * yet (see src/lib/hunters/accounting-financial-change.ts). Callers should
 * skip records that don't resolve rather than fail the whole run.
 */
export async function getSecurityIdByCik(cik: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const normalized = cik.replace(/\D/g, "").padStart(10, "0");

  const { data } = await supabase
    .from("securities")
    .select("id")
    .eq("cik", normalized)
    .order("created_at", { ascending: true })
    .limit(1);

  return data && data.length > 0 ? data[0].id : null;
}
