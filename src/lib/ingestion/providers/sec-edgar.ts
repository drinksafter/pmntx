import "server-only";

import { completeIngestionRun, startIngestionRun, writeSourceRecord } from "@/lib/ingestion/runs";
import type { IngestionOutcome } from "@/lib/ingestion/types";

// SEC EDGAR's data.sec.gov JSON API needs no API key, only a descriptive
// User-Agent identifying the requester (SEC's fair access policy —
// unidentified/high-volume traffic gets rate-limited or blocked). Treat a
// missing contact email as NOT_CONFIGURED rather than sending an
// unidentified request.
const SEC_EDGAR_BASE_URL = "https://data.sec.gov";

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

type SecSubmissionsResponse = {
  filings?: {
    recent?: {
      form: string[];
      filingDate: string[];
      accessionNumber: string[];
      primaryDocument: string[];
    };
  };
};

/**
 * Feeds the ACCOUNTING_FINANCIAL_CHANGE Hunter (and any other filings-based
 * signal). Writes one source_record per recent filing with the raw form
 * metadata — detecting a specific signal (late filing, restatement, etc.)
 * from form type is the Hunter's job, not the ingestion client's.
 * `event_date`/`public_date` are both the SEC filingDate: a filing becomes
 * public the moment it's accepted, so there's no separate "knowable" lag
 * the way there is for Quiver's feeds.
 */
export async function ingestCompanyFilings(cik: string): Promise<IngestionOutcome> {
  const contactEmail = process.env.PMNTX_SEC_EDGAR_CONTACT_EMAIL;
  if (!contactEmail) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

  const runId = await startIngestionRun("SEC_EDGAR");
  const paddedCik = padCik(cik);

  try {
    const response = await fetch(`${SEC_EDGAR_BASE_URL}/submissions/CIK${paddedCik}.json`, {
      headers: { "User-Agent": `PMNTX ${contactEmail}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`SEC EDGAR returned HTTP ${response.status}`);

    const data = (await response.json()) as SecSubmissionsResponse;
    const recent = data.filings?.recent;
    if (!recent) throw new Error("No filings.recent in SEC EDGAR response.");

    let recordsIngested = 0;
    for (let i = 0; i < recent.form.length; i++) {
      const filingDate = recent.filingDate[i];
      if (!filingDate) continue;

      await writeSourceRecord({
        dataSourceCode: "SEC_EDGAR",
        dataIngestionRunId: runId,
        sourceRecordId: recent.accessionNumber[i],
        entityType: "filing",
        eventDate: filingDate,
        publicDate: new Date(filingDate).toISOString(),
        raw: {
          cik: paddedCik,
          form: recent.form[i],
          filingDate,
          accessionNumber: recent.accessionNumber[i],
          primaryDocument: recent.primaryDocument[i],
        },
      });
      recordsIngested += 1;
    }

    await completeIngestionRun(runId, "SUCCEEDED", recordsIngested);
    return { status: "SUCCEEDED", recordsIngested };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown SEC EDGAR error.";
    await completeIngestionRun(runId, "FAILED", 0, errorMessage);
    return { status: "FAILED", recordsIngested: 0, errorMessage };
  }
}
