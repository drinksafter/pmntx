import "server-only";

import { getSecurityIdByCik } from "@/lib/ingestion/securities";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { HunterImplementation, HunterSignal } from "./types";

type SecFilingRaw = {
  cik?: string;
  form?: string;
  filingDate?: string;
  accessionNumber?: string;
};

// Phase 1A detects only form-type signals visible directly in SEC EDGAR's
// submissions feed — it does not parse 8-K item numbers (e.g. Item 4.02
// non-reliance/restatement) or filing text, both of which would sharpen
// this Hunter considerably. See docs/NEXT_PHASE.md.
//
// NT 10-K / NT 10-Q (late-filing notifications) are a well-documented
// negative signal — companies file them when they can't complete a
// periodic report on time, often preceding restatements or other bad news.
const BEARISH_FORMS = new Set(["NT 10-K", "NT 10-Q"]);

export const accountingFinancialChangeHunter: HunterImplementation = {
  code: "ACCOUNTING_FINANCIAL_CHANGE",
  version: "v1",

  async run(asOfDate: string): Promise<HunterSignal[]> {
    const supabase = createServiceRoleClient();

    const { data: source } = await supabase
      .from("data_sources")
      .select("id")
      .eq("code", "SEC_EDGAR")
      .single();
    if (!source) return [];

    const { data: records } = await supabase
      .from("source_records")
      .select("id, raw")
      .eq("data_source_id", source.id)
      .eq("entity_type", "filing")
      .eq("event_date", asOfDate);
    if (!records || records.length === 0) return [];

    const signals: HunterSignal[] = [];

    for (const record of records) {
      const raw = record.raw as SecFilingRaw | null;
      if (!raw?.cik || !raw.form || !BEARISH_FORMS.has(raw.form)) continue;

      const securityId = await getSecurityIdByCik(raw.cik);
      if (!securityId) continue; // no ticker crosswalk for this CIK yet — skip rather than guess

      signals.push({
        securityId,
        asOfDate,
        signalDirection: "BEARISH",
        normalizedScore: -0.5,
        confidence: 0.6,
        dataQuality: 0.7, // form-type-only detection; see module comment
        evidence: { form: raw.form, accessionNumber: raw.accessionNumber },
        explanation: `Filed ${raw.form} on ${asOfDate} — late-filing notification, a documented precursor to restatements or other negative accounting news.`,
        sourceRecordId: record.id,
      });
    }

    return signals;
  },
};
