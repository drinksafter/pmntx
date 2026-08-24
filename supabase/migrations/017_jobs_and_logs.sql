-- 017_jobs_and_logs
-- Research Jobs framework (brief §37/§87): QUEUED/RUNNING/SUCCEEDED/
-- FAILED/PARTIAL, driving both the scheduled Morning Research cron and
-- the Admin "Run Morning Research Now" button through one code path.

create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'MORNING_RESEARCH'
  name text not null,
  cron_expression text not null,
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);

create type job_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');
create type job_trigger as enum ('SCHEDULED', 'MANUAL');

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  scheduled_job_id uuid references scheduled_jobs (id) on delete set null,
  job_type text not null, -- 'MORNING_RESEARCH', etc.
  status job_status not null default 'QUEUED',
  stage text, -- current pipeline stage, per docs/PHASE_1A_PLAN.md §7 sequence
  progress jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  triggered_by job_trigger not null default 'SCHEDULED',
  triggered_by_user_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index job_runs_status_idx on job_runs (status);
create index job_runs_created_idx on job_runs (created_at desc);

create type log_level as enum ('DEBUG', 'INFO', 'WARN', 'ERROR');

create table system_logs (
  id uuid primary key default gen_random_uuid(),
  level log_level not null,
  source text not null,
  message text not null,
  context jsonb,
  job_run_id uuid references job_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index system_logs_created_idx on system_logs (created_at desc);
create index system_logs_level_idx on system_logs (level);
create index system_logs_job_run_idx on system_logs (job_run_id);

alter table scheduled_jobs enable row level security;
alter table job_runs enable row level security;
alter table system_logs enable row level security;

create policy "scheduled_jobs_admin_only" on scheduled_jobs
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "job_runs_admin_only" on job_runs
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "system_logs_admin_only" on system_logs
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));

insert into scheduled_jobs (code, name, cron_expression, is_enabled) values
  ('MORNING_RESEARCH', 'Morning Research Cycle', '17 8 * * 1-5', true);
