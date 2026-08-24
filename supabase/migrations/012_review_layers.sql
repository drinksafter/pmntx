-- 012_review_layers
-- PMNTX Agent Selection, consensus, Red Team, and a Risk stub. Agent
-- debate schema is included (architect only per scope lock §2 — no
-- selective-debate trigger logic ships in Phase 1A).

-- PMNTX's secondary evaluation of an agent-originated idea — a distinct
-- research product from PMNTX Core and from the agent's own list (brief
-- §18 / Prompt 2 §3C).
create table pmntx_agent_selections (
  id uuid primary key default gen_random_uuid(),
  agent_daily_list_id uuid not null references agent_daily_lists (id) on delete cascade,
  original_agent_rank integer,
  original_agent_score numeric,
  pmntx_original_rank integer,   -- null if PMNTX did not independently rank this security
  pmntx_original_score numeric,
  pmntx_secondary_score numeric,
  pmntx_secondary_recommendation idea_direction,
  evidence_discovered text,
  approved boolean not null default false,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (agent_daily_list_id)
);

create index pmntx_agent_selections_approved_idx on pmntx_agent_selections (approved);

-- Architect only (docs/PHASE_1A_SCOPE_LOCK.md §2): table exists, the
-- selective-debate trigger logic that would populate it does not ship in
-- Phase 1A.
create table agent_debates (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  participants jsonb not null default '[]'::jsonb,
  trigger_reason text,
  initial_positions jsonb,
  rebuttals jsonb,
  factual_disagreements text,
  assumption_disagreements text,
  horizon_disagreements text,
  testable_predictions text,
  created_at timestamptz not null default now()
);

create index agent_debates_security_idx on agent_debates (security_id);

-- Raw agreement ships in Phase 1A. Independence-adjusted consensus is
-- architect-only (the column exists, stays null until that logic exists —
-- see docs/NEXT_PHASE.md).
create table consensus_snapshots (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  run_date date not null,
  systems_count integer not null default 0,
  direction_agreement jsonb not null default '{}'::jsonb,
  probability_dispersion numeric,
  score_dispersion numeric,
  horizon_agreement jsonb,
  raw_consensus_score numeric,
  independence_adjusted_consensus_score numeric, -- architect only, see docs/NEXT_PHASE.md
  created_at timestamptz not null default now(),
  unique (security_id, run_date)
);

create index consensus_snapshots_run_date_idx on consensus_snapshots (run_date desc);

create type red_team_severity as enum ('LOW', 'MEDIUM', 'HIGH');

create table red_team_reviews (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions (id) on delete cascade,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  findings jsonb not null default '[]'::jsonb, -- array of {category, concern, severity}
  concerns text[],
  severity red_team_severity,
  summary text,
  created_at timestamptz not null default now()
);

create index red_team_reviews_prediction_idx on red_team_reviews (prediction_id);

create type risk_recommendation as enum ('APPROVE', 'APPROVE_SMALLER', 'WATCH', 'DO_NOT_ADD');

-- Minimal stub per docs/PHASE_1A_SCOPE_LOCK.md §2 — sector exposure and
-- concentration notes only, not the full factor/rates/credit/macro depth
-- from Prompt 2 §35 (docs/NEXT_PHASE.md).
create table risk_reviews (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions (id) on delete cascade,
  recommendation risk_recommendation not null,
  notes text,
  sector_exposure jsonb,
  concentration_notes text,
  created_at timestamptz not null default now()
);

create index risk_reviews_prediction_idx on risk_reviews (prediction_id);

alter table pmntx_agent_selections enable row level security;
alter table agent_debates enable row level security;
alter table consensus_snapshots enable row level security;
alter table red_team_reviews enable row level security;
alter table risk_reviews enable row level security;

create policy "pmntx_agent_selections_select_authenticated" on pmntx_agent_selections
  for select using (auth.role() = 'authenticated');
create policy "agent_debates_select_authenticated" on agent_debates
  for select using (auth.role() = 'authenticated');
create policy "consensus_snapshots_select_authenticated" on consensus_snapshots
  for select using (auth.role() = 'authenticated');
create policy "red_team_reviews_select_authenticated" on red_team_reviews
  for select using (auth.role() = 'authenticated');
create policy "risk_reviews_select_authenticated" on risk_reviews
  for select using (auth.role() = 'authenticated');
