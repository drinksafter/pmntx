-- 016_user_features
-- Schema only per docs/PHASE_1A_SCOPE_LOCK.md §3 — Watchlists, Ask PMNTX,
-- and user theme/thesis submission are all deferred UI. These tables
-- exist so `idea_origin`'s USER_SECURITY/USER_THEME/USER_THESIS values
-- have somewhere real to point once that UI is built, and so a
-- user-initiated research request can be marked and excluded from
-- PMNTX Core's independent-discovery performance per brief §35/§49
-- without a later migration.

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (watchlist_id, security_id)
);

create type user_thesis_type as enum ('THEME', 'THESIS', 'STRATEGY_IDEA');

create table user_theses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  thesis_type user_thesis_type not null,
  content text not null,
  status text not null default 'SUBMITTED',
  created_at timestamptz not null default now()
);

create type user_research_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- Marked permanently USER_INITIATED (brief §35) so it never contaminates
-- PMNTX Core's independent-discovery performance, per outcome-tracking
-- queries filtering on this table's absence.
create table user_research_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  status user_research_status not null default 'QUEUED',
  research_run_id uuid references research_runs (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index user_research_requests_profile_idx on user_research_requests (profile_id);
create index watchlists_profile_idx on watchlists (profile_id);
create index watchlist_items_watchlist_idx on watchlist_items (watchlist_id);

alter table watchlists enable row level security;
alter table watchlist_items enable row level security;
alter table user_theses enable row level security;
alter table user_research_requests enable row level security;

create policy "watchlists_owner_or_admin" on watchlists
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "watchlist_items_owner_or_admin" on watchlist_items
  for select using (
    exists (
      select 1 from watchlists w
      join profiles p on p.id = w.profile_id
      where w.id = watchlist_items.watchlist_id
        and (p.user_id = auth.uid()
             or exists (select 1 from profiles pa where pa.user_id = auth.uid() and pa.role = 'ADMIN'))
    )
  );
create policy "user_theses_owner_or_admin" on user_theses
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "user_research_requests_owner_or_admin" on user_research_requests
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
