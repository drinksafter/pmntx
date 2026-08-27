-- 032_prediction_contract_extensions
-- Extends the EXISTING Prediction Warehouse (010_ideas_and_predictions.sql)
-- into the ML pivot's standardized prediction contract, rather than
-- creating a competing duplicate warehouse. All additive; the existing
-- immutability trigger (reject_frozen_prediction_mutation) needs no code
-- change — it blocks UPDATE/DELETE on the whole row regardless of which
-- columns exist. `environment` defaults to 'PRODUCTION' so every existing
-- historical row stays semantically correct with zero backfill.

alter table predictions
  add column model_id uuid references models (id) on delete set null,
  add column model_version_id uuid references model_versions (id) on delete set null,
  add column environment text not null default 'PRODUCTION'
    check (environment in ('PRODUCTION', 'SHADOW', 'EXPERIMENT')),
  add column estimated_inference_cost_usd numeric(12, 6),
  add column actual_inference_cost_usd numeric(12, 6);

-- Which exact feature_values rows fed a prediction — the "input feature
-- snapshot/reference" the standardized contract asks for.
create table prediction_feature_snapshot (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions (id) on delete cascade,
  feature_value_id uuid not null references feature_values (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (prediction_id, feature_value_id)
);
create index prediction_feature_snapshot_prediction_idx on prediction_feature_snapshot (prediction_id);

alter table prediction_feature_snapshot enable row level security;
create policy "prediction_feature_snapshot_select_authenticated" on prediction_feature_snapshot
  for select using (auth.role() = 'authenticated');

create trigger prediction_feature_snapshot_immutability
  before update or delete on prediction_feature_snapshot
  for each row
  execute function reject_frozen_prediction_child_mutation();
