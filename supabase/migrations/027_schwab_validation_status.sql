-- 027_schwab_validation_status
-- Tracks IMPLEMENTED / MOCK-VALIDATED / LIVE-VALIDATED as a real, auditable
-- fact rather than a claim in a report. mode='LIVE' rows may only ever be
-- written by the real production code paths (oauth.ts's token exchange/
-- refresh, the provider methods' real success paths) succeeding against
-- Schwab's actual servers — a mocked test script has no way to produce
-- one, by construction (it only ever calls the code with mode='MOCK'
-- passed explicitly, and application code decides the mode based on
-- whether a real HTTP call actually happened, not on caller say-so).

create type schwab_validation_component as enum ('OAUTH', 'MARKET_DATA', 'ACCOUNT_DATA');
create type schwab_validation_mode as enum ('MOCK', 'LIVE');
create type schwab_validation_result as enum ('PASSED', 'FAILED');

create table schwab_validation_runs (
  id uuid primary key default gen_random_uuid(),
  component schwab_validation_component not null,
  mode schwab_validation_mode not null,
  result schwab_validation_result not null,
  detail jsonb,
  run_at timestamptz not null default now()
);

create index schwab_validation_runs_component_idx on schwab_validation_runs (component, mode, run_at desc);

alter table schwab_validation_runs enable row level security;

create policy "schwab_validation_runs_admin_only" on schwab_validation_runs
  for select using (is_admin());
