-- 030_model_registry
-- Generalized model registry for the ML pivot. PMNTx must not assume
-- neural networks are superior — model_type spans naive baselines through
-- LLM analysts and PMNTx Core itself, so every candidate can be compared
-- on the same footing. Training/research and production stay separate:
-- promotion requires an explicit auditable event (model_promotion_events,
-- append-only, mirrors proposed_trade_events' pattern exactly) — nothing
-- here lets a model self-promote.

create type model_type as enum (
  'NAIVE_BASELINE', 'DETERMINISTIC_FACTOR', 'LINEAR', 'LOGISTIC', 'TREE_BOOSTING',
  'NEURAL', 'PMNTX_CORE', 'LLM_ANALYST', 'SPECIALIST_AGENT', 'ENSEMBLE'
);

create type model_status as enum (
  'EXPERIMENTAL', 'VALIDATED', 'SHADOW', 'PAPER', 'PRODUCTION', 'RETIRED'
);

create table models (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'PMNTX_CORE', 'BASELINE_NAIVE', 'BASELINE_LOGREG'
  name text not null,
  model_type model_type not null,
  description text,
  created_at timestamptz not null default now()
);

create table model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models (id) on delete cascade,
  version text not null,
  status model_status not null default 'EXPERIMENTAL',
  horizons forecast_horizon[] not null default '{}',
  required_feature_schema_version text,
  training_period_start date,
  training_period_end date,
  validation_period_start date,
  validation_period_end date,
  artifact_reference jsonb, -- coefficients/config — no blob storage this phase
  cost_class text not null default 'FREE'
    check (cost_class in ('FREE', 'CHEAP', 'MODERATE', 'EXPENSIVE')),
  estimated_inference_cost_usd numeric(12, 6) not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  retired_at timestamptz,
  retirement_reason text,
  unique (model_id, version)
);

create index model_versions_model_idx on model_versions (model_id);
create index model_versions_status_idx on model_versions (status);

create type model_promotion_event_type as enum (
  'REGISTERED', 'VALIDATED', 'PROMOTED_TO_SHADOW', 'PROMOTED_TO_PAPER',
  'PROMOTED_TO_PRODUCTION', 'DEMOTED', 'RETIRED'
);

-- Append-only, mirrors src/lib/broker/events.ts's proposed_trade_events.
create table model_promotion_events (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references model_versions (id) on delete cascade,
  event_type model_promotion_event_type not null,
  from_status model_status,
  to_status model_status not null,
  reason text,
  detail jsonb,
  actor uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index model_promotion_events_version_idx on model_promotion_events (model_version_id, created_at);

alter table models enable row level security;
alter table model_versions enable row level security;
alter table model_promotion_events enable row level security;

create policy "models_select_authenticated" on models
  for select using (auth.role() = 'authenticated');
create policy "model_versions_select_authenticated" on model_versions
  for select using (auth.role() = 'authenticated');
create policy "model_promotion_events_admin_only" on model_promotion_events
  for select using (is_admin());

-- Seeds PMNTx Core's own model/version at PRODUCTION — this records an
-- existing fact (Core has always been PMNTx's production ranking engine),
-- not a new promotion, so no model_promotion_events row is written for it.
insert into models (code, name, model_type, description)
values ('PMNTX_CORE', 'PMNTx Core', 'PMNTX_CORE', 'Deterministic Hunter-signal composition and ranking engine.');

insert into model_versions (model_id, version, status, promoted_at, cost_class)
select id, 'v1', 'PRODUCTION', now(), 'FREE' from models where code = 'PMNTX_CORE';
