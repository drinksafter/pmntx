import "server-only";

import { getOrCreateSecurityByTicker } from "@/lib/ingestion/securities";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { clampScore, clampUnit, type HunterImplementation, type HunterSignal } from "./types";

// $100M in same-day contract awards treated as a maximal signal — a
// starting threshold, not a calibrated one (see insider-activity.ts for
// the same caveat).
const NORMALIZATION_USD = 100_000_000;

type QuiverGovContractRaw = {
  Ticker?: string;
  Agency?: string;
  Amount?: number;
  Description?: string;
};

export const governmentContractsHunter: HunterImplementation = {
  code: "GOVERNMENT_CONTRACTS",
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
      .select("id, raw")
      .eq("data_source_id", source.id)
      .eq("entity_type", "gov_contract")
      .eq("event_date", asOfDate);
    if (!records || records.length === 0) return [];

    const byTicker = new Map<
      string,
      { totalAmount: number; count: number; agencies: Set<string>; recordIds: string[] }
    >();

    for (const record of records) {
      const raw = record.raw as QuiverGovContractRaw | null;
      if (!raw?.Ticker || typeof raw.Amount !== "number") continue;

      const entry = byTicker.get(raw.Ticker) ?? {
        totalAmount: 0,
        count: 0,
        agencies: new Set<string>(),
        recordIds: [],
      };
      entry.totalAmount += raw.Amount;
      entry.count += 1;
      if (raw.Agency) entry.agencies.add(raw.Agency);
      entry.recordIds.push(record.id);
      byTicker.set(raw.Ticker, entry);
    }

    const signals: HunterSignal[] = [];
    for (const [ticker, { totalAmount, count, agencies, recordIds }] of byTicker) {
      const securityId = await getOrCreateSecurityByTicker(ticker);
      // Contract awards are one-directional data (wins, not losses) — score
      // is non-negative by construction, unlike insider activity's net buy/sell.
      const normalizedScore = clampScore(totalAmount / NORMALIZATION_USD);

      signals.push({
        securityId,
        asOfDate,
        signalDirection: normalizedScore > 0.02 ? "BULLISH" : "NEUTRAL",
        rawValue: totalAmount,
        normalizedScore,
        confidence: clampUnit(count / 3),
        dataQuality: 1,
        evidence: { totalAmountUsd: totalAmount, contractCount: count, agencies: [...agencies] },
        explanation: `${count} government contract award(s) on ${asOfDate} totaling $${totalAmount.toLocaleString()}.`,
        sourceRecordId: recordIds[0],
      });
    }

    return signals;
  },
};
