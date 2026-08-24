-- 006_hunters
-- Generic Hunter framework (docs/PHASE_1A_PLAN.md §3): Phase 1A
-- instantiates 3–4 Hunters, but the schema supports the full network
-- from Prompt 2 §7 without redesign.

create table hunter_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'INSIDER_ACTIVITY'
  name text not null,
  category text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table hunter_versions (
  id uuid primary key default gen_random_uuid(),
  hunter_definition_id uuid not null references hunter_definitions (id) on delete cascade,
  version text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (hunter_definition_id, version)
);

create index hunter_versions_definition_idx on hunter_versions (hunter_definition_id);

create type signal_direction as enum ('BULLISH', 'BEARISH', 'NEUTRAL');

create table hunter_results (
  id uuid primary key default gen_random_uuid(),
  hunter_version_id uuid not null references hunter_versions (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  as_of_date date not null,
  signal_direction signal_direction not null,
  raw_value numeric,
  normalized_score numeric not null check (normalized_score between -1 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  data_quality numeric not null check (data_quality between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  explanation text,
  source_record_id uuid references source_records (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (hunter_version_id, security_id, as_of_date)
);

create index hunter_results_security_date_idx on hunter_results (security_id, as_of_date desc);
create index hunter_results_hunter_version_idx on hunter_results (hunter_version_id, as_of_date desc);

alter table hunter_definitions enable row level security;
alter table hunter_versions enable row level security;
alter table hunter_results enable row level security;

create policy "hunter_definitions_select_authenticated" on hunter_definitions
  for select using (auth.role() = 'authenticated');
create policy "hunter_versions_select_authenticated" on hunter_versions
  for select using (auth.role() = 'authenticated');
create policy "hunter_results_select_authenticated" on hunter_results
  for select using (auth.role() = 'authenticated');

-- Seed the full Hunter category catalog from Prompt 2 §7 as inactive
-- definitions so the schema/UI can reference the whole network — Phase 1A
-- activates only the ones it implements (see the seed's is_active values).
insert into hunter_definitions (code, name, category, description, is_active) values
  ('INSIDER_ACTIVITY', 'Insider Activity', 'INSIDER', 'Insider buying/selling signals.', true),
  ('GOVERNMENT_CONTRACTS', 'Government Contracts', 'CONTRACTS', 'Federal contract award activity.', true),
  ('ACCOUNTING_FINANCIAL_CHANGE', 'Accounting / Financial Change', 'ACCOUNTING', 'Filing-derived accounting and financial statement changes.', true),
  ('MARKET_PRICE_ANOMALY', 'Market / Price / Volume Anomaly', 'MARKET', 'Statistical price/volume anomalies.', false),
  ('INSTITUTIONAL_ACTIVITY', 'Institutional Activity', 'INSTITUTIONAL', '13F-derived institutional positioning changes.', false),
  ('SEC_FILING_LANGUAGE', 'SEC Filing Changes / Language', 'FILINGS', 'NLP-derived filing language change detection.', false),
  ('POLITICAL_REGULATORY', 'Political / Regulatory Signals', 'POLICY', 'Legislative and regulatory signal tracking.', false),
  ('INNOVATION_PATENT', 'Innovation / Patent Signals', 'INNOVATION', 'Patent filing and innovation signal tracking.', false),
  ('MACRO_SENSITIVITY', 'Macro Sensitivity', 'MACRO', 'Security sensitivity to macro factors.', false),
  ('WEIRD_STUFF', 'Weird Stuff / Cross-Signal Anomalies', 'ANOMALY', 'Open-ended unusual signal-combination detection.', false);
