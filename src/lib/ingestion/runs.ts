import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

type DataSourceCode = "QUIVER" | "SEC_EDGAR" | "FRED" | "MARKET_DATA";

/**
 * Shared data_ingestion_runs + source_records bookkeeping for every
 * provider client under src/lib/ingestion/providers — keeps the
 * provenance/look-ahead-bias guarantees (docs/PHASE_1A_PLAN.md §11) in one
 * place instead of re-implemented per provider.
 */
export async function startIngestionRun(sourceCode: DataSourceCode): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: source, error: sourceError } = await supabase
    .from("data_sources")
    .select("id")
    .eq("code", sourceCode)
    .single();

  if (sourceError || !source) {
    throw new Error(`Unknown data source code "${sourceCode}" — check data_sources seed data.`);
  }

  const { data: run, error: runError } = await supabase
    .from("data_ingestion_runs")
    .insert({ data_source_id: source.id, status: "RUNNING", started_at: new Date().toISOString() })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to start ingestion run for "${sourceCode}": ${runError?.message}`);
  }

  return run.id;
}

export async function completeIngestionRun(
  runId: string,
  status: "SUCCEEDED" | "FAILED" | "PARTIAL",
  recordsIngested: number,
  errorMessage?: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("data_ingestion_runs")
    .update({
      status,
      records_ingested: recordsIngested,
      error_message: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export type SourceRecordInput = {
  dataSourceCode: DataSourceCode;
  dataIngestionRunId: string;
  sourceRecordId?: string;
  entityType: string;
  entityId?: string;
  eventDate: string; // YYYY-MM-DD — when the underlying event happened
  publicDate: string; // ISO timestamp — when it became knowable; never earlier than eventDate
  raw: unknown;
};

/**
 * Writes one provenance-anchored fact. `publicDate` is the field every
 * downstream Hunter/prediction query filters on to avoid look-ahead bias —
 * when a provider doesn't expose a true "known as of" timestamp, callers
 * should pass ingestion time rather than guess, per docs/PHASE_1A_PLAN.md §11.
 */
export async function writeSourceRecord(input: SourceRecordInput): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: source, error: sourceError } = await supabase
    .from("data_sources")
    .select("id")
    .eq("code", input.dataSourceCode)
    .single();

  if (sourceError || !source) {
    throw new Error(`Unknown data source code "${input.dataSourceCode}".`);
  }

  const { error } = await supabase.from("source_records").insert({
    data_source_id: source.id,
    data_ingestion_run_id: input.dataIngestionRunId,
    source_record_id: input.sourceRecordId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    event_date: input.eventDate,
    public_date: input.publicDate,
    raw: input.raw,
  });

  if (error) throw error;
}
