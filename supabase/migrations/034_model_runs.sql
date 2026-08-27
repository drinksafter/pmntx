-- 034_model_runs
-- Mirrors agent_runs (009_agents.sql) exactly, same reasoning as that
-- table's own header comment: avoids a circular reference between
-- research_runs and models by resolving "which model version does this
-- research_run belong to" via a join table rather than a column on
-- research_runs itself.

create type model_run_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

create table model_runs (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references model_versions (id) on delete restrict,
  research_run_id uuid not null references research_runs (id) on delete cascade,
  status model_run_status not null default 'QUEUED',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (research_run_id) -- one model per research_run; research_run itself is per-model-per-day
);

create index model_runs_model_version_idx on model_runs (model_version_id);

alter table model_runs enable row level security;

-- Mirrors agent_runs_select_frozen_or_admin exactly.
create policy "model_runs_select_frozen_or_admin" on model_runs
  for select using (
    is_admin()
    or exists (
      select 1 from research_runs rr
      where rr.id = model_runs.research_run_id
        and rr.frozen_at is not null
    )
  );
