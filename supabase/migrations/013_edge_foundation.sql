-- 013_edge_foundation
-- Architect only (docs/PHASE_1A_SCOPE_LOCK.md §2): schema for the
-- Experiment Registry and Edge Ledger exists so Phase 1B can build on it
-- without a redesign, but no lifecycle logic or UI ships in Phase 1A.

create type edge_status as enum ('CANDIDATE', 'TESTING', 'ACTIVE', 'WATCH', 'DECAYING', 'RETIRED');

create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hypothesis text not null,
  universe text,
  features jsonb,
  horizon text,
  benchmark text,
  success_criteria text,
  sample_requirements text,
  origin text,
  status text not null default 'PROPOSED',
  created_at timestamptz not null default now()
);

create table experiment_runs (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments (id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'QUEUED',
  results jsonb,
  created_at timestamptz not null default now()
);

create index experiment_runs_experiment_idx on experiment_runs (experiment_id);

create table edges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hypothesis text not null,
  discovery_date date,
  origin text,
  feature_definitions jsonb,
  relevant_universe text,
  best_horizon text,
  status edge_status not null default 'CANDIDATE',
  confidence numeric check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table edge_versions (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references edges (id) on delete cascade,
  version text not null,
  config jsonb,
  created_at timestamptz not null default now(),
  unique (edge_id, version)
);

create table edge_evidence (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references edges (id) on delete cascade,
  evidence_type text not null,
  backtest_result jsonb,
  validation_result jsonb,
  oos_result jsonb,
  live_shadow_result jsonb,
  robustness_score numeric,
  factor_adjusted_result jsonb,
  sample_size integer,
  favorable_regimes text,
  unfavorable_regimes text,
  created_at timestamptz not null default now()
);

create index edge_evidence_edge_idx on edge_evidence (edge_id);

create table edge_performance (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references edges (id) on delete cascade,
  as_of_date date not null,
  decay_metrics jsonb,
  created_at timestamptz not null default now(),
  unique (edge_id, as_of_date)
);

alter table experiments enable row level security;
alter table experiment_runs enable row level security;
alter table edges enable row level security;
alter table edge_versions enable row level security;
alter table edge_evidence enable row level security;
alter table edge_performance enable row level security;

create policy "experiments_admin_only" on experiments
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "experiment_runs_admin_only" on experiment_runs
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "edges_select_authenticated" on edges
  for select using (auth.role() = 'authenticated');
create policy "edge_versions_select_authenticated" on edge_versions
  for select using (auth.role() = 'authenticated');
create policy "edge_evidence_select_authenticated" on edge_evidence
  for select using (auth.role() = 'authenticated');
create policy "edge_performance_select_authenticated" on edge_performance
  for select using (auth.role() = 'authenticated');
