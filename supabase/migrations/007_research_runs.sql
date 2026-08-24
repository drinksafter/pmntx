-- 007_research_runs
-- A research_run is one system's (PMNTX Core, or one agent) independent
-- research pass for a given day. Which agent a run belongs to (if any) is
-- resolved via agent_runs (migration 009) rather than a column here, to
-- avoid a circular reference between this table and agents.

create type research_run_origin as enum ('PMNTX_CORE', 'AGENT');
create type research_run_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

create table research_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  origin_type research_run_origin not null,
  status research_run_status not null default 'QUEUED',
  score_version text,
  started_at timestamptz,
  completed_at timestamptz,
  -- Set once, never cleared — this is the independence-firewall gate.
  -- Other systems may only read this run's candidate_rankings once
  -- frozen_at is set. See src/lib/research/independence.ts.
  frozen_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index research_runs_date_idx on research_runs (run_date desc);
create index research_runs_origin_status_idx on research_runs (origin_type, status);
create index research_runs_frozen_idx on research_runs (frozen_at) where frozen_at is not null;

create type idea_direction as enum ('LONG', 'SHORT', 'WATCH', 'PASS');

create table candidate_rankings (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  rank integer,
  score numeric not null,
  score_components jsonb not null default '{}'::jsonb,
  selected boolean not null default false,
  selection_reason text,
  direction idea_direction,
  created_at timestamptz not null default now(),
  unique (research_run_id, security_id)
);

create index candidate_rankings_run_idx on candidate_rankings (research_run_id, rank);
create index candidate_rankings_security_idx on candidate_rankings (security_id);
create index candidate_rankings_selected_idx on candidate_rankings (research_run_id) where selected = true;

-- Broad daily snapshot (brief §13/§30) — deliberately NOT limited to
-- selected securities, so score-decile/rank-band performance can be
-- analyzed later without having thrown the data away.
create table daily_rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  rank integer not null,
  score numeric not null,
  percentile numeric,
  decile smallint,
  created_at timestamptz not null default now(),
  unique (research_run_id, security_id)
);

create index daily_rank_snapshots_run_idx on daily_rank_snapshots (research_run_id);
create index daily_rank_snapshots_decile_idx on daily_rank_snapshots (decile);

alter table research_runs enable row level security;
alter table candidate_rankings enable row level security;
alter table daily_rank_snapshots enable row level security;

-- Independence firewall, enforced in the database, not just in
-- application code: a non-admin (i.e. anything going through the
-- authenticated/anon roles rather than the service role, which bypasses
-- RLS) can only ever see a run's candidate rankings if that run is
-- frozen. The service role — used by research-pipeline code — bypasses
-- RLS entirely, which is how a system can read its OWN not-yet-frozen
-- work while writing it, without that visibility leaking to any other
-- reader.
create policy "research_runs_select_frozen_or_admin" on research_runs
  for select using (
    frozen_at is not null
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );

create policy "candidate_rankings_select_frozen_or_admin" on candidate_rankings
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = candidate_rankings.research_run_id
        and (rr.frozen_at is not null
             or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'))
    )
  );

create policy "daily_rank_snapshots_select_frozen_or_admin" on daily_rank_snapshots
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = daily_rank_snapshots.research_run_id
        and (rr.frozen_at is not null
             or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'))
    )
  );
