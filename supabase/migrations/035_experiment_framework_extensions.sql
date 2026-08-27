-- 035_experiment_framework_extensions
-- Extends the existing "architect only" experiments/experiment_runs
-- tables (013_edge_foundation.sql) into the ML pivot's real experiment
-- framework, rather than a parallel table. Safe to retype `status` from
-- loose text to a real enum: zero application code references either
-- table anywhere in the repo today (confirmed by direct grep before
-- writing this migration).
--
-- `experiment_runs.promotion_decision` deliberately excludes any
-- production-flavored value — a DB-level guarantee (independent of the
-- code-level runAsAdminPromotionAction gate in src/lib/models/) that no
-- experiment run, mock or otherwise, can record itself as promoting
-- straight to production.

create type experiment_lifecycle_status as enum (
  'PROPOSED', 'DATASET_DEFINED', 'TRAINING', 'TRAINED', 'VALIDATING', 'VALIDATED',
  'WALK_FORWARD_TESTING', 'TESTED', 'COST_ADJUSTED', 'BENCHMARKED',
  'PROMOTION_DECIDED', 'COMPLETE', 'FAILED'
);

alter table experiments
  alter column status drop default,
  alter column status type experiment_lifecycle_status using status::experiment_lifecycle_status,
  alter column status set default 'PROPOSED';

alter table experiments
  add column feature_schema_version text,
  add column dataset_start_date date,
  add column dataset_end_date date,
  add column train_start_date date,
  add column train_end_date date,
  add column validation_start_date date,
  add column validation_end_date date,
  add column test_start_date date,
  add column test_end_date date,
  add column random_seed integer,
  add column candidate_model_version_id uuid references model_versions (id) on delete set null,
  add column benchmark_model_version_id uuid references model_versions (id) on delete set null,
  add column survivorship_bias_warning text,
  add column cost_adjustment_bps numeric;

alter table experiment_runs
  alter column status drop default,
  alter column status type experiment_lifecycle_status using status::experiment_lifecycle_status,
  alter column status set default 'PROPOSED';

alter table experiment_runs
  add column seed_used integer,
  add column train_row_count integer,
  add column validation_row_count integer,
  add column test_row_count integer,
  -- Mirrors the schwab_validation_runs MOCK/LIVE precedent.
  add column is_mock boolean not null default true,
  add column promotion_decision text
    check (promotion_decision in ('PROMOTE_TO_VALIDATED', 'PROMOTE_TO_SHADOW', 'REJECT', 'INCONCLUSIVE')),
  add column promoted_model_version_id uuid references model_versions (id) on delete set null;
