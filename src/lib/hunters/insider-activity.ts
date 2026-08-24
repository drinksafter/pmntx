import "server-only";

import { getOrCreateSecurityByTicker } from "@/lib/ingestion/securities";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { clampScore, clampUnit, type HunterImplementation, type HunterSignal } from "./types";

// Net dollar value of same-day insider buying vs. selling, scaled to
// [-1, 1]. $2M net is treated as a maximal signal — an intentionally
// simple, tunable starting point (see hunter_versions.config for where a
// future version would make this admin-configurable), not a calibrated
// threshold.
const NORMALIZATION_USD = 2_000_000;

type QuiverInsiderRaw = {
  Ticker?: string;
  Transaction?: string; // "Purchase" | "Sale"
  Shares?: number;
  Value?: number;
};

export const insiderActivityHunter: HunterImplementation = {
  code: "INSIDER_ACTIVITY",
  version: "v1",

  async run(asOfDate: string): Promise<HunterSignal[]> {
    const supabase = createServiceRoleClient();

    const { data: source } = await supabase
      .from("data_sources")
      .select("id")
      .eq("code", "QUIVER")
      .single();
    if (!source) return [];

    const { data: records } = await supabase
      .from("source_records")
      .select("id, entity_type, raw")
      .eq("data_source_id", source.id)
      .eq("entity_type", "insider_transaction")
      .eq("event_date", asOfDate);
    if (!records || records.length === 0) return [];

    const byTicker = new Map<string, { netValue: number; count: number; recordIds: string[] }>();

    for (const record of records) {
      const raw = record.raw as QuiverInsiderRaw | null;
      if (!raw?.Ticker || typeof raw.Value !== "number") continue;

      const signedValue = raw.Transaction === "Sale" ? -raw.Value : raw.Value;
      const entry = byTicker.get(raw.Ticker) ?? { netValue: 0, count: 0, recordIds: [] };
      entry.netValue += signedValue;
      entry.count += 1;
      entry.recordIds.push(record.id);
      byTicker.set(raw.Ticker, entry);
    }

    const signals: HunterSignal[] = [];
    for (const [ticker, { netValue, count, recordIds }] of byTicker) {
      const securityId = await getOrCreateSecurityByTicker(ticker);
      const normalizedScore = clampScore(netValue / NORMALIZATION_USD);

      signals.push({
        securityId,
        asOfDate,
        signalDirection: normalizedScore > 0.05 ? "BULLISH" : normalizedScore < -0.05 ? "BEARISH" : "NEUTRAL",
        rawValue: netValue,
        normalizedScore,
        confidence: clampUnit(count / 5),
        dataQuality: 1,
        evidence: { netValueUsd: netValue, transactionCount: count },
        explanation: `${count} insider transaction(s) on ${asOfDate}, net ${netValue >= 0 ? "buying" : "selling"} of $${Math.abs(netValue).toLocaleString()}.`,
        sourceRecordId: recordIds[0],
      });
    }

    return signals;
  },
};
