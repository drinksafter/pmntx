-- 037_cost_aware_router
-- Deterministic first-generation router (pivot brief §16) sitting in
-- front of the existing AI gateway/pipeline functions — decides whether
-- an expensive inference call is justified. Tier thresholds are
-- admin-editable, never hardcoded. Every decision (INVOKE or SKIP) is
-- recorded, always.

create table routing_tier_configs (
  id uuid primary key default gen_random_uuid(),
  tier_code text not null unique,
  display_name text not null,
  min_rank integer,
  max_rank integer,
  min_confidence numeric,
  min_disagreement numeric,
  requires_material_change boolean not null default false,
  max_daily_invocations integer,
  min_hours_since_last_analysis integer,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create trigger routing_tier_configs_set_updated_at
  before update on routing_tier_configs
  for each row
  execute function set_updated_at();

insert into routing_tier_configs
  (tier_code, display_name, min_rank, max_rank, min_confidence, min_disagreement, min_hours_since_last_analysis)
values
  ('BLIND_ANALYSIS', 'Dual-Provider Blind Analysis', 1, 25, 0.55, null, 24),
  ('AGENT_REVIEW', 'Specialist Agent Review', 1, 15, 0.60, 0.25, 24);

-- Append-only audit of every routing decision. tier_code is a plain text
-- snapshot, deliberately NOT an FK to routing_tier_configs — a historical
-- decision must stay an immutable fact even if the config it was
-- evaluated against later changes or is renamed.
create table router_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_ranking_id uuid references candidate_rankings (id) on delete cascade,
  security_id uuid references securities (id) on delete set null,
  tier_code text not null,
  decision text not null check (decision in ('INVOKE', 'SKIP')),
  reasoning text not null,
  inputs_snapshot jsonb not null default '{}'::jsonb,
  budget_remaining_daily_usd numeric,
  budget_remaining_monthly_usd numeric,
  created_at timestamptz not null default now()
);
create index router_decisions_candidate_idx on router_decisions (candidate_ranking_id);
create index router_decisions_decision_idx on router_decisions (decision, created_at desc);

alter table routing_tier_configs enable row level security;
alter table router_decisions enable row level security;

create policy "routing_tier_configs_select_authenticated" on routing_tier_configs
  for select using (auth.role() = 'authenticated');
create policy "router_decisions_select_authenticated" on router_decisions
  for select using (auth.role() = 'authenticated');
