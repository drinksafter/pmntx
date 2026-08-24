-- 004_provenance
-- This migration is the load-bearing one for docs/PHASE_1A_PLAN.md §11:
-- PMNTX must never use information in a historical analysis before that
-- information was actually available. Every table that stores an
-- externally sourced observation should reference source_records (or at
-- minimum carry its own event_date/public_date/ingested_at triplet).

create type ingestion_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
create type ingestion_trigger as enum ('SCHEDULED', 'MANUAL');

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'QUIVER', 'SEC_EDGAR', 'FRED', 'MARKET_DATA'
  name text not null,
  category text not null,
  description text,
  base_url text,
  created_at timestamptz not null default now()
);

create table data_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources (id) on delete restrict,
  status ingestion_status not null default 'QUEUED',
  triggered_by ingestion_trigger not null default 'SCHEDULED',
  triggered_by_user_id uuid references profiles (id),
  started_at timestamptz,
  completed_at timestamptz,
  records_ingested integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index data_ingestion_runs_source_idx on data_ingestion_runs (data_source_id, created_at desc);
create index data_ingestion_runs_status_idx on data_ingestion_runs (status);

-- Generic provenance anchor: one row per externally sourced fact, that
-- domain tables (hunter_results, filings-derived signals, etc.) can point
-- back to. `entity_type`/`entity_id` let this stay generic rather than
-- needing a new provenance table per domain concept.
create table source_records (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources (id) on delete restrict,
  data_ingestion_run_id uuid references data_ingestion_runs (id) on delete set null,
  source_record_id text, -- the source's own ID for this record, if it has one
  entity_type text not null, -- e.g. 'insider_transaction', 'gov_contract', 'filing'
  entity_id uuid,
  event_date date not null,       -- when the underlying event happened
  public_date timestamptz not null, -- when it became knowable to an investor
  ingested_at timestamptz not null default now(),
  transformation_version text not null default 'v1',
  raw jsonb,
  created_at timestamptz not null default now()
);

create index source_records_source_idx on source_records (data_source_id);
create index source_records_entity_idx on source_records (entity_type, entity_id);
create index source_records_public_date_idx on source_records (public_date);

-- Hard invariant: an event can't be publicly known before it happened.
alter table source_records
  add constraint source_records_public_date_after_event
  check (public_date >= event_date::timestamptz);

alter table data_sources enable row level security;
alter table data_ingestion_runs enable row level security;
alter table source_records enable row level security;

create policy "data_sources_select_authenticated" on data_sources
  for select using (auth.role() = 'authenticated');
create policy "data_ingestion_runs_select_authenticated" on data_ingestion_runs
  for select using (auth.role() = 'authenticated');
create policy "source_records_select_authenticated" on source_records
  for select using (auth.role() = 'authenticated');

-- Seed the data sources this Phase 1A schema is designed around.
insert into data_sources (code, name, category, description) values
  ('QUIVER', 'Quiver Quantitative', 'ALTERNATIVE_DATA', 'Insider activity, government contracts, and other alternative data.'),
  ('SEC_EDGAR', 'SEC EDGAR', 'PUBLIC_DATA', 'SEC filings and XBRL company facts.'),
  ('FRED', 'FRED / ALFRED', 'PUBLIC_DATA', 'Macro / vintage macro data.'),
  ('MARKET_DATA', 'Market Data Provider', 'MARKET_DATA', 'Daily OHLCV and reference pricing (provider configurable in Admin).');
