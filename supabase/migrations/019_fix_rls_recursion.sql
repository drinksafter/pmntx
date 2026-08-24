-- 019_fix_rls_recursion
-- Every "is this user an ADMIN" RLS check so far was written as
-- `exists (select 1 from profiles p where p.user_id = auth.uid() and
-- p.role = 'ADMIN')` inline inside another policy. When that check lives
-- inside a policy defined ON profiles itself (001_auth_and_users.sql),
-- Postgres has to evaluate profiles' own RLS policy to run the subquery
-- that IS that policy — genuine infinite recursion, not just theoretical:
-- confirmed live via smoke test as
-- "infinite recursion detected in policy for relation "profiles"".
--
-- Fix: a single `security definer` function that queries profiles with
-- RLS bypassed (security definer functions run as their owner, not the
-- calling role), so no policy ever recurses through profiles' own RLS.
-- Every affected policy across migrations 001/005/007/008/009/010/011/
-- 013/016/017 is dropped and recreated here to call is_admin() instead.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'
  );
$$;

-- ---- 001_auth_and_users: profiles (the actual recursion source) --------

drop policy "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin"
  on profiles for select
  using (user_id = auth.uid() or is_admin());

drop policy "profiles_update_own_display_name_or_admin" on profiles;
create policy "profiles_update_own_display_name_or_admin"
  on profiles for update
  using (user_id = auth.uid() or is_admin())
  with check (
    is_admin()
    or (user_id = auth.uid() and role = (select role from profiles where user_id = auth.uid()))
  );

-- ---- 005_integrations ---------------------------------------------------

drop policy "integration_credentials_admin_only" on integration_credentials;
create policy "integration_credentials_admin_only" on integration_credentials
  for select using (is_admin());
drop policy "integration_health_admin_only" on integration_health;
create policy "integration_health_admin_only" on integration_health
  for select using (is_admin());
drop policy "provider_usage_admin_only" on provider_usage;
create policy "provider_usage_admin_only" on provider_usage
  for select using (is_admin());

-- ---- 007_research_runs ---------------------------------------------------

drop policy "research_runs_select_frozen_or_admin" on research_runs;
create policy "research_runs_select_frozen_or_admin" on research_runs
  for select using (frozen_at is not null or is_admin());

drop policy "candidate_rankings_select_frozen_or_admin" on candidate_rankings;
create policy "candidate_rankings_select_frozen_or_admin" on candidate_rankings
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = candidate_rankings.research_run_id
        and (rr.frozen_at is not null or is_admin())
    )
  );

drop policy "daily_rank_snapshots_select_frozen_or_admin" on daily_rank_snapshots;
create policy "daily_rank_snapshots_select_frozen_or_admin" on daily_rank_snapshots
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = daily_rank_snapshots.research_run_id
        and (rr.frozen_at is not null or is_admin())
    )
  );

-- ---- 008_ai_infrastructure ------------------------------------------------

drop policy "ai_config_admin_only_providers" on ai_providers;
create policy "ai_config_admin_only_providers" on ai_providers
  for select using (is_admin());
drop policy "ai_config_admin_only_models" on ai_models;
create policy "ai_config_admin_only_models" on ai_models
  for select using (is_admin());
drop policy "ai_config_admin_only_routes" on ai_routes;
create policy "ai_config_admin_only_routes" on ai_routes
  for select using (is_admin());
drop policy "ai_config_admin_only_templates" on prompt_templates;
create policy "ai_config_admin_only_templates" on prompt_templates
  for select using (is_admin());
drop policy "ai_config_admin_only_versions" on prompt_versions;
create policy "ai_config_admin_only_versions" on prompt_versions
  for select using (is_admin());
drop policy "ai_config_admin_only_executions" on ai_executions;
create policy "ai_config_admin_only_executions" on ai_executions
  for select using (is_admin());

-- ---- 009_agents ------------------------------------------------------------

drop policy "agent_runs_select_frozen_or_admin" on agent_runs;
create policy "agent_runs_select_frozen_or_admin" on agent_runs
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = agent_runs.research_run_id
        and (rr.frozen_at is not null or is_admin())
    )
  );

drop policy "agent_daily_lists_select_frozen_or_admin" on agent_daily_lists;
create policy "agent_daily_lists_select_frozen_or_admin" on agent_daily_lists
  for select using (frozen_at is not null or is_admin());

-- ---- 010_ideas_and_predictions ---------------------------------------------

drop policy "predictions_select_frozen_or_admin" on predictions;
create policy "predictions_select_frozen_or_admin" on predictions
  for select using (frozen_at is not null or is_admin());

drop policy "prediction_horizons_select_frozen_or_admin" on prediction_horizons;
create policy "prediction_horizons_select_frozen_or_admin" on prediction_horizons
  for select using (
    exists (
      select 1 from predictions pr
      where pr.id = prediction_horizons.prediction_id
        and (pr.frozen_at is not null or is_admin())
    )
  );

drop policy "prediction_scenarios_select_frozen_or_admin" on prediction_scenarios;
create policy "prediction_scenarios_select_frozen_or_admin" on prediction_scenarios
  for select using (
    exists (
      select 1 from predictions pr
      where pr.id = prediction_scenarios.prediction_id
        and (pr.frozen_at is not null or is_admin())
    )
  );

-- ---- 011_blind_reveal -------------------------------------------------------

drop policy "blind_analyses_select_frozen_or_admin" on blind_analyses;
create policy "blind_analyses_select_frozen_or_admin" on blind_analyses
  for select using (frozen_at is not null or is_admin());
drop policy "revealed_analyses_select_frozen_or_admin" on revealed_analyses;
create policy "revealed_analyses_select_frozen_or_admin" on revealed_analyses
  for select using (frozen_at is not null or is_admin());

-- ---- 013_edge_foundation -----------------------------------------------------

drop policy "experiments_admin_only" on experiments;
create policy "experiments_admin_only" on experiments
  for select using (is_admin());
drop policy "experiment_runs_admin_only" on experiment_runs;
create policy "experiment_runs_admin_only" on experiment_runs
  for select using (is_admin());

-- ---- 016_user_features -------------------------------------------------------

drop policy "watchlists_owner_or_admin" on watchlists;
create policy "watchlists_owner_or_admin" on watchlists
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or is_admin()
  );

drop policy "watchlist_items_owner_or_admin" on watchlist_items;
create policy "watchlist_items_owner_or_admin" on watchlist_items
  for select using (
    exists (
      select 1 from watchlists w
      join profiles p on p.id = w.profile_id
      where w.id = watchlist_items.watchlist_id
        and (p.user_id = auth.uid() or is_admin())
    )
  );

drop policy "user_theses_owner_or_admin" on user_theses;
create policy "user_theses_owner_or_admin" on user_theses
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or is_admin()
  );

drop policy "user_research_requests_owner_or_admin" on user_research_requests;
create policy "user_research_requests_owner_or_admin" on user_research_requests
  for select using (
    profile_id in (select id from profiles where user_id = auth.uid())
    or is_admin()
  );

-- ---- 017_jobs_and_logs ---------------------------------------------------------

drop policy "scheduled_jobs_admin_only" on scheduled_jobs;
create policy "scheduled_jobs_admin_only" on scheduled_jobs
  for select using (is_admin());
drop policy "job_runs_admin_only" on job_runs;
create policy "job_runs_admin_only" on job_runs
  for select using (is_admin());
drop policy "system_logs_admin_only" on system_logs;
create policy "system_logs_admin_only" on system_logs
  for select using (is_admin());
