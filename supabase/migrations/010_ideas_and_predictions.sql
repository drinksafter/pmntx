-- 010_ideas_and_predictions
-- The Prediction Warehouse. This is the core asset (brief §92): PMNTX
-- never forgets a prediction. Immutability is enforced by trigger below,
-- not just by application discipline.

create type idea_origin as enum (
  'PMNTX_CORE',
  'AGENT_BUFFETT',
  'AGENT_GERSTNER',
  'AGENT_MILLENNIUM',
  'AGENT_CITADEL',
  'AGENT_JANE_STREET',
  'AGENT_HRT',
  'AGENT_OPTIVER',
  'AGENT_JUMP',
  'AGENT_DRUCKENMILLER',
  'AGENT_ARK',
  'USER_SECURITY',
  'USER_THEME',
  'USER_THESIS',
  'EDGE_LAB',
  'OTHER_SYSTEM'
);

create table ideas (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  origin idea_origin not null,
  research_run_id uuid references research_runs (id) on delete set null,
  agent_daily_list_id uuid references agent_daily_lists (id) on delete set null,
  direction idea_direction not null,
  created_at timestamptz not null default now()
);

create index ideas_security_idx on ideas (security_id);
create index ideas_origin_idx on ideas (origin);

create type forecast_horizon as enum ('D1', 'D5', 'D10', 'D21', 'D63', 'D126', 'Y1', 'Y2', 'Y3', 'Y5');
create type forecast_type as enum ('FORECAST', 'NO_FORECAST', 'INSUFFICIENT_EDGE', 'OUTSIDE_MANDATE');
create type outcome_status as enum ('PENDING', 'PARTIALLY_RESOLVED', 'RESOLVED');

-- One row per frozen prediction. NEVER updated after frozen_at is set —
-- see the immutability trigger at the bottom of this file. A changed view
-- is a NEW row referencing the old one via supersedes_prediction_id.
create table predictions (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  origin idea_origin not null,
  research_run_id uuid references research_runs (id) on delete set null,
  agent_id uuid references agents (id) on delete set null,

  -- what the system knew, and when
  data_cutoff timestamptz not null,
  reference_price numeric not null,
  reference_price_at timestamptz not null,

  direction idea_direction not null,
  score numeric,
  score_version text,

  thesis text,
  catalysts text,
  risks text,
  invalidation_criteria text,
  best_horizon_label text,

  regime_snapshot_id uuid, -- FK added in 014_regime_foundation after that table exists
  ai_execution_id uuid references ai_executions (id) on delete set null,
  prompt_version_id uuid references prompt_versions (id) on delete set null,

  supersedes_prediction_id uuid references predictions (id) on delete set null,

  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create index predictions_security_idx on predictions (security_id, created_at desc);
create index predictions_origin_idx on predictions (origin);
create index predictions_research_run_idx on predictions (research_run_id);
create index predictions_frozen_idx on predictions (frozen_at) where frozen_at is not null;

create table prediction_horizons (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions (id) on delete cascade,
  horizon forecast_horizon not null,
  forecast_type forecast_type not null default 'FORECAST',
  expected_return numeric,
  expected_price numeric,
  probability_positive numeric check (probability_positive between 0 and 1),
  probability_negative numeric check (probability_negative between 0 and 1),
  probability_outperform_benchmark numeric check (probability_outperform_benchmark between 0 and 1),
  expected_benchmark_relative_return numeric,
  bear_range_low numeric,
  bear_range_high numeric,
  base_range_low numeric,
  base_range_high numeric,
  bull_range_low numeric,
  bull_range_high numeric,
  downside_tail_estimate numeric,
  confidence numeric check (confidence between 0 and 1),
  data_quality numeric check (data_quality between 0 and 1),
  assumptions text,
  created_at timestamptz not null default now(),
  unique (prediction_id, horizon)
);

create index prediction_horizons_prediction_idx on prediction_horizons (prediction_id);
create index prediction_horizons_horizon_idx on prediction_horizons (horizon);

-- 3Y/5Y are explicitly long-term SCENARIO valuations, not standardized
-- statistical forecasts (brief §16) — kept in a separate table so the UI
-- and any calibration analysis never accidentally treats them the same
-- way as the 1D–2Y horizons.
create table prediction_scenarios (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions (id) on delete cascade,
  scenario_name text not null, -- 'bear' | 'base' | 'bull' | custom
  horizon_label text not null, -- '3Y' | '5Y'
  assumptions text,
  expected_return numeric,
  expected_price numeric,
  created_at timestamptz not null default now()
);

create index prediction_scenarios_prediction_idx on prediction_scenarios (prediction_id);

create table prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_horizon_id uuid not null references prediction_horizons (id) on delete cascade,
  status outcome_status not null default 'PENDING',
  actual_price numeric,
  actual_return numeric,
  benchmark_return numeric,
  excess_return numeric,
  direction_correct boolean,
  forecast_error numeric,
  max_favorable_excursion numeric,
  max_adverse_excursion numeric,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (prediction_horizon_id)
);

create index prediction_outcomes_status_idx on prediction_outcomes (status);

-- ---------------------------------------------------------------------
-- Immutability enforcement (brief §14/§27/§71): once frozen_at is set on
-- a prediction, reject any UPDATE or DELETE on that row, and on its
-- horizon/scenario children. Corrections must insert a new prediction
-- referencing the original via supersedes_prediction_id.
-- ---------------------------------------------------------------------

create or replace function reject_frozen_prediction_mutation()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'DELETE') then
    if OLD.frozen_at is not null then
      raise exception 'predictions: row % is frozen and cannot be deleted', OLD.id;
    end if;
    return OLD;
  end if;

  -- UPDATE: block once frozen, with one narrow exception — allowing
  -- frozen_at itself to transition from NULL to a timestamp (the freeze
  -- operation) is handled by requiring OLD.frozen_at is null for that case.
  if OLD.frozen_at is not null then
    raise exception 'predictions: row % is frozen and cannot be modified', OLD.id;
  end if;

  return NEW;
end;
$$;

create trigger predictions_immutability
  before update or delete on predictions
  for each row
  execute function reject_frozen_prediction_mutation();

create or replace function reject_frozen_prediction_child_mutation()
returns trigger
language plpgsql
as $$
declare
  parent_frozen_at timestamptz;
  target_prediction_id uuid;
begin
  target_prediction_id := coalesce(NEW.prediction_id, OLD.prediction_id);
  select frozen_at into parent_frozen_at from predictions where id = target_prediction_id;

  if parent_frozen_at is not null then
    raise exception '%: parent prediction % is frozen, child rows are immutable', TG_TABLE_NAME, target_prediction_id;
  end if;

  if (TG_OP = 'DELETE') then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger prediction_horizons_immutability
  before update or delete on prediction_horizons
  for each row
  execute function reject_frozen_prediction_child_mutation();

create trigger prediction_scenarios_immutability
  before update or delete on prediction_scenarios
  for each row
  execute function reject_frozen_prediction_child_mutation();

-- prediction_outcomes is the one deliberate exception: it's written AFTER
-- freeze, as horizons mature, by design (outcome resolution). It has its
-- own status field and is append-once-per-horizon (unique constraint
-- above) rather than freeze-gated.

alter table ideas enable row level security;
alter table predictions enable row level security;
alter table prediction_horizons enable row level security;
alter table prediction_scenarios enable row level security;
alter table prediction_outcomes enable row level security;

create policy "ideas_select_authenticated" on ideas
  for select using (auth.role() = 'authenticated');

create policy "predictions_select_frozen_or_admin" on predictions
  for select using (
    frozen_at is not null
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "prediction_horizons_select_frozen_or_admin" on prediction_horizons
  for select using (
    exists (
      select 1 from predictions pr
      where pr.id = prediction_horizons.prediction_id
        and (pr.frozen_at is not null
             or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'))
    )
  );
create policy "prediction_scenarios_select_frozen_or_admin" on prediction_scenarios
  for select using (
    exists (
      select 1 from predictions pr
      where pr.id = prediction_scenarios.prediction_id
        and (pr.frozen_at is not null
             or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'))
    )
  );
create policy "prediction_outcomes_select_authenticated" on prediction_outcomes
  for select using (auth.role() = 'authenticated');
