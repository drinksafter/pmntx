-- 036_candidate_ranking_extensions
-- Extends the existing candidate_rankings table (007_research_runs.sql)
-- for multi-model candidate ranking rather than a competing table.
-- score_components (already jsonb) is reused for the multi-model score
-- breakdown; these are additive columns for signals specific to the
-- cost-aware routing decision that follows in candidate ranking.

alter table candidate_rankings
  add column model_disagreement numeric,
  add column novelty_signal numeric,
  add column material_change_flag boolean not null default false,
  add column recommended_next_tier text,
  add column horizon forecast_horizon,
  add column confidence numeric check (confidence is null or confidence between 0 and 1);

-- Singleton, admin-editable — funnel-size thresholds must never be
-- hardcoded (pivot brief §14). Mirrors ai_system_controls' singleton
-- pattern (020_ai_cost_guardrails.sql).
create table candidate_ranking_configs (
  id boolean primary key default true,
  max_candidates integer not null default 100,
  min_score_threshold numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  constraint candidate_ranking_configs_singleton check (id)
);

create trigger candidate_ranking_configs_set_updated_at
  before update on candidate_ranking_configs
  for each row
  execute function set_updated_at();

insert into candidate_ranking_configs (id) values (true);

alter table candidate_ranking_configs enable row level security;
create policy "candidate_ranking_configs_select_authenticated" on candidate_ranking_configs
  for select using (auth.role() = 'authenticated');
