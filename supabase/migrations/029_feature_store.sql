-- 029_feature_store
-- Point-in-time feature store for the ML pivot (docs/architecture/PMNTX_ML_PIVOT_AUDIT.md).
-- Every feature value carries enough timestamps to answer "what could
-- PMNTx actually have known as of historical timestamp T" — the
-- `available_at` column is the query key every point-in-time read filters
-- on. This is a separate, derived/computed layer above source_records
-- (004_provenance.sql), which already carries the same point-in-time
-- philosophy for raw ingested records (event_date/public_date) — this
-- table reuses that precedent for computed numeric feature values.
--
-- Revisions are new rows, never in-place updates (no unique constraint on
-- the value) — preserving historical versions per the pivot brief §6.

create type feature_family as enum (
  'RETURNS', 'MOMENTUM', 'VOLATILITY', 'VOLUME_LIQUIDITY', 'RELATIVE_STRENGTH',
  'FUNDAMENTALS', 'EARNINGS', 'VALUATION', 'SECTOR_INDUSTRY', 'MACRO_RATES',
  'ALTERNATIVE_DATA', 'OPTIONS_DERIVED'
);

create table feature_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'RETURN_5D', 'MOMENTUM_20D'
  name text not null,
  family feature_family not null,
  description text,
  schema_version text not null default 'v1',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table feature_values (
  id uuid primary key default gen_random_uuid(),
  feature_definition_id uuid not null references feature_definitions (id) on delete restrict,
  security_id uuid not null references securities (id) on delete cascade,
  value numeric not null,
  observation_at timestamptz not null,    -- when the underlying fact occurred
  effective_at timestamptz,               -- when it took effect, if different (e.g. restated earnings)
  publication_at timestamptz,             -- when the source published it
  available_at timestamptz not null,      -- when PMNTx could actually have known it — the critical column
  source text not null,
  source_version text,
  source_record_id uuid references source_records (id) on delete set null,
  ingested_at timestamptz not null default now(),
  feature_schema_version text not null default 'v1',
  created_at timestamptz not null default now(),
  constraint feature_values_available_at_after_observation check (available_at >= observation_at)
);

create index feature_values_security_feature_available_idx
  on feature_values (security_id, feature_definition_id, available_at desc);
create index feature_values_feature_idx on feature_values (feature_definition_id);

alter table feature_definitions enable row level security;
alter table feature_values enable row level security;

create policy "feature_definitions_select_authenticated" on feature_definitions
  for select using (auth.role() = 'authenticated');
create policy "feature_values_select_authenticated" on feature_values
  for select using (auth.role() = 'authenticated');
