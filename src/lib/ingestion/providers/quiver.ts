import "server-only";

import { getDecryptedCredential } from "@/lib/credentials/store";
import { completeIngestionRun, startIngestionRun, writeSourceRecord } from "@/lib/ingestion/runs";
import type { IngestionOutcome } from "@/lib/ingestion/types";

// Quiver Quantitative REST API. Endpoint paths below reflect Quiver's
// documented "live" feeds as of when this was written — verify against
// https://api.quiverquant.com's current docs before relying on this in
// production; a 404/shape change here should surface as a FAILED
// ingestion run (see catch block), not a silent no-op.
const QUIVER_BASE_URL = "https://api.quiverquant.com/beta";

async function quiverGet<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${QUIVER_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Quiver ${path} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

type QuiverInsiderRecord = {
  Ticker?: string;
  Date?: string;
  Name?: string;
  Transaction?: string;
  Shares?: number;
  Value?: number;
};

/**
 * Feeds the INSIDER_ACTIVITY Hunter. `public_date` is set to ingestion
 * time rather than the record's own Date field — Quiver's "Date" typically
 * reflects the underlying Form 4 transaction date, not when Quiver's feed
 * made it available to us, and docs/PHASE_1A_PLAN.md §11 requires never
 * guessing an earlier availability than we can prove.
 */
export async function ingestInsiderActivity(): Promise<IngestionOutcome> {
  const apiKey = await getDecryptedCredential("QUIVER");
  if (!apiKey) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

  const runId = await startIngestionRun("QUIVER");
  const ingestedAt = new Date().toISOString();

  try {
    const records = await quiverGet<QuiverInsiderRecord[]>("/live/insiders", apiKey);
    let recordsIngested = 0;

    for (const record of records) {
      if (!record.Ticker || !record.Date) continue;
      await writeSourceRecord({
        dataSourceCode: "QUIVER",
        dataIngestionRunId: runId,
        entityType: "insider_transaction",
        eventDate: record.Date,
        publicDate: ingestedAt,
        raw: record,
      });
      recordsIngested += 1;
    }

    await completeIngestionRun(runId, "SUCCEEDED", recordsIngested);
    return { status: "SUCCEEDED", recordsIngested };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown Quiver error.";
    await completeIngestionRun(runId, "FAILED", 0, errorMessage);
    return { status: "FAILED", recordsIngested: 0, errorMessage };
  }
}

type QuiverGovContractRecord = {
  Ticker?: string;
  Date?: string;
  Agency?: string;
  Amount?: number;
  Description?: string;
};

/** Feeds the GOVERNMENT_CONTRACTS Hunter. Same public_date caveat as insider activity above. */
export async function ingestGovernmentContracts(): Promise<IngestionOutcome> {
  const apiKey = await getDecryptedCredential("QUIVER");
  if (!apiKey) return { status: "NOT_CONFIGURED", recordsIngested: 0 };

  const runId = await startIngestionRun("QUIVER");
  const ingestedAt = new Date().toISOString();

  try {
    const records = await quiverGet<QuiverGovContractRecord[]>("/live/govcontractsall", apiKey);
    let recordsIngested = 0;

    for (const record of records) {
      if (!record.Ticker || !record.Date) continue;
      await writeSourceRecord({
        dataSourceCode: "QUIVER",
        dataIngestionRunId: runId,
        entityType: "gov_contract",
        eventDate: record.Date,
        publicDate: ingestedAt,
        raw: record,
      });
      recordsIngested += 1;
    }

    await completeIngestionRun(runId, "SUCCEEDED", recordsIngested);
    return { status: "SUCCEEDED", recordsIngested };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown Quiver error.";
    await completeIngestionRun(runId, "FAILED", 0, errorMessage);
    return { status: "FAILED", recordsIngested: 0, errorMessage };
  }
}
