import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Coarse market-cap buckets, not exact figures — a specific market cap is
// often enough on its own to identify a well-known company. Buckets keep
// "how big is this company" (economically meaningful) while dropping the
// precision that makes it identifiable.
function bucketMarketCap(marketCap: number | null): string | null {
  if (marketCap === null) return null;
  if (marketCap < 300_000_000) return "MICRO (<$300M)";
  if (marketCap < 2_000_000_000) return "SMALL ($300M-$2B)";
  if (marketCap < 10_000_000_000) return "MID ($2B-$10B)";
  if (marketCap < 50_000_000_000) return "LARGE ($10B-$50B)";
  if (marketCap < 200_000_000_000) return "MEGA ($50B-$200B)";
  return "ULTRA-MEGA (>$200B)";
}

export type AnonymizedResearchPacket = {
  sector: string | null;
  industry: string | null;
  securityType: string;
  marketCapBucket: string | null;
  recentPrices: { daysAgo: number; close: number; volume: number | null }[];
  pmntxCoreScore: number;
  pmntxCoreRank: number | null;
  pmntxCoreDirection: string | null;
  hunterSignals: {
    hunterCode: string;
    direction: string;
    normalizedScore: number;
    confidence: number;
    explanation: string | null;
  }[];
  dataCutoff: string;
};

/**
 * Builds the factual, identity-stripped packet a blind analyst sees.
 * Deliberately excludes ticker, company name, CIK, and exchange — the
 * direct identifiers — while keeping sector/industry/size/price/Hunter
 * signals, which are the "economically meaningful information" the blind
 * analysis brief requires preserving. Recent price levels and market cap
 * are an unavoidable, documented residual re-identification risk for very
 * distinctive or famous securities; there's no complete fix for that
 * short of withholding data that's actually needed for analysis.
 *
 * Called once per security per research run and reused for both blind
 * analysts (the "research packet reuse" requirement) — never rebuilt per
 * provider call.
 */
export async function buildAnonymizedPacket(
  securityId: string,
  researchRunId: string
): Promise<AnonymizedResearchPacket> {
  const supabase = createServiceRoleClient();

  const [{ data: security }, { data: ranking }, { data: prices }, { data: hunterResults }] = await Promise.all([
    supabase.from("securities").select("sector, industry, security_type, market_cap").eq("id", securityId).single(),
    supabase
      .from("candidate_rankings")
      .select("score, rank, direction")
      .eq("research_run_id", researchRunId)
      .eq("security_id", securityId)
      .single(),
    supabase
      .from("market_prices")
      .select("price_date, close, volume")
      .eq("security_id", securityId)
      .order("price_date", { ascending: false })
      .limit(10),
    supabase
      .from("hunter_results")
      .select("hunter_version_id, signal_direction, normalized_score, confidence, explanation")
      .eq("security_id", securityId)
      .order("as_of_date", { ascending: false })
      .limit(10),
  ]);

  const { data: versions } = await supabase.from("hunter_versions").select("id, hunter_definition_id");
  const { data: defs } = await supabase.from("hunter_definitions").select("id, code");
  const codeByDefId = new Map((defs ?? []).map((d) => [d.id, d.code]));
  const codeByVersionId = new Map(
    (versions ?? []).map((v) => [v.id, codeByDefId.get(v.hunter_definition_id) ?? "UNKNOWN"])
  );

  const sortedPrices = (prices ?? []).slice().reverse(); // oldest-to-newest for daysAgo computation
  const mostRecentDate = sortedPrices.at(-1)?.price_date;

  return {
    sector: security?.sector ?? null,
    industry: security?.industry ?? null,
    securityType: security?.security_type ?? "EQUITY",
    marketCapBucket: bucketMarketCap(security?.market_cap ?? null),
    recentPrices: sortedPrices.map((p) => ({
      daysAgo: mostRecentDate
        ? Math.round((new Date(mostRecentDate).getTime() - new Date(p.price_date).getTime()) / 86_400_000)
        : 0,
      close: Number(p.close),
      volume: p.volume,
    })),
    pmntxCoreScore: Number(ranking?.score ?? 0),
    pmntxCoreRank: ranking?.rank ?? null,
    pmntxCoreDirection: ranking?.direction ?? null,
    hunterSignals: (hunterResults ?? []).map((r) => ({
      hunterCode: codeByVersionId.get(r.hunter_version_id) ?? "UNKNOWN",
      direction: r.signal_direction,
      normalizedScore: Number(r.normalized_score),
      confidence: Number(r.confidence),
      explanation: r.explanation,
    })),
    dataCutoff: new Date().toISOString(),
  };
}
