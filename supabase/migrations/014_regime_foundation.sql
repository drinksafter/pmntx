-- 014_regime_foundation
-- Architect only (docs/PHASE_1A_SCOPE_LOCK.md §2): schema exists so every
-- prediction can be tagged with a regime, but no real classifier ships in
-- Phase 1A — a single placeholder regime is seeded and used for every
-- snapshot until Phase 1B builds real classification logic.

create table regimes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dimensions jsonb, -- growth/inflation/rates/liquidity/credit/volatility/breadth/dollar/commodities descriptors
  classifier_version text not null default 'placeholder-v0',
  created_at timestamptz not null default now()
);

create table regime_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  regime_id uuid not null references regimes (id) on delete restrict,
  growth numeric,
  inflation numeric,
  rates numeric,
  liquidity numeric,
  credit numeric,
  volatility numeric,
  breadth numeric,
  dollar numeric,
  commodities numeric,
  created_at timestamptz not null default now(),
  unique (as_of_date)
);

-- Deferred FK from 010_ideas_and_predictions, now that regime_snapshots exists.
alter table predictions
  add constraint predictions_regime_snapshot_fk
  foreign key (regime_snapshot_id) references regime_snapshots (id) on delete set null;

alter table regimes enable row level security;
alter table regime_snapshots enable row level security;

create policy "regimes_select_authenticated" on regimes
  for select using (auth.role() = 'authenticated');
create policy "regime_snapshots_select_authenticated" on regime_snapshots
  for select using (auth.role() = 'authenticated');

insert into regimes (name, classifier_version) values ('Unclassified', 'placeholder-v0');
