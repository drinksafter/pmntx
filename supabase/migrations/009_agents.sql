-- 009_agents
-- Generic Agent architecture (docs/PHASE_1A_SCOPE_LOCK.md §1). Phase 1A
-- instantiates 2 agents (Buffett/Compounder, Gerstner/Technology Growth);
-- the other 8 from Prompt 2 §13 are seeded as inactive so idea_origins
-- (migration 010) and every join against "agents" already has a stable
-- target for them without a later migration.

create table agents (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null unique, -- e.g. 'BUFFETT_AGENT'
  display_name text not null,         -- e.g. 'Compounder Agent'
  methodology_description text not null,
  inspiration_disclaimer text not null default
    'Inspired by publicly documented investment principles. Not affiliated with, endorsed by, or reproducing the proprietary methods of any individual or firm.',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents (id) on delete cascade,
  version text not null,
  system_prompt text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (agent_id, version)
);

create index agent_versions_agent_idx on agent_versions (agent_id);

create type agent_run_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions (id) on delete restrict,
  research_run_id uuid not null references research_runs (id) on delete cascade,
  status agent_run_status not null default 'QUEUED',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (research_run_id) -- one agent per research_run; research_run itself is per-agent-per-day
);

create index agent_runs_agent_version_idx on agent_runs (agent_version_id);

create table agent_daily_lists (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  direction idea_direction not null,
  rank integer,
  agent_score numeric,
  probability numeric,
  thesis text,
  catalyst text,
  risks text,
  invalidation_criteria text,
  best_horizon_label text, -- free text, e.g. "90-180 days" — see prediction_horizons for standardized horizons
  discovery_reason text,
  data_quality numeric check (data_quality between 0 and 1),
  -- Independence firewall applies here too: frozen_at gates visibility to
  -- other systems, same mechanism as research_runs.frozen_at.
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agent_run_id, security_id)
);

create index agent_daily_lists_run_idx on agent_daily_lists (agent_run_id);
create index agent_daily_lists_security_idx on agent_daily_lists (security_id);

alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table agent_runs enable row level security;
alter table agent_daily_lists enable row level security;

create policy "agents_select_authenticated" on agents
  for select using (auth.role() = 'authenticated');
create policy "agent_versions_select_authenticated" on agent_versions
  for select using (auth.role() = 'authenticated');

create policy "agent_runs_select_frozen_or_admin" on agent_runs
  for select using (
    exists (
      select 1 from research_runs rr
      where rr.id = agent_runs.research_run_id
        and (rr.frozen_at is not null
             or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'))
    )
  );

create policy "agent_daily_lists_select_frozen_or_admin" on agent_daily_lists
  for select using (
    frozen_at is not null
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );

-- Full ten-agent roster (brief §13/Prompt 2 §13). Only Buffett and
-- Gerstner are active in Phase 1A — see docs/PHASE_1A_SCOPE_LOCK.md.
insert into agents (internal_name, display_name, methodology_description, is_active) values
  ('BUFFETT_AGENT', 'Compounder Agent',
   'Focus: economic moats, owner earnings, capital allocation, per-share economics, management stewardship, intrinsic value, margin of safety, long-duration compounding. Comfortable returning NO VIEW for very short horizons.',
   true),
  ('GERSTNER_AGENT', 'Technology Growth Agent',
   'Focus: technology, AI, secular growth, product adoption, TAM, unit economics, operating leverage, management execution, forward expectations, valuation discipline.',
   true),
  ('MILLENNIUM_AGENT', 'Multi-Strategy Agent',
   'Focus: multi-strategy thinking, disciplined risk/reward, catalyst identification, portfolio interactions, drawdown control, independent idea evaluation.',
   false),
  ('CITADEL_AGENT', 'Fundamental-Quant Agent',
   'Focus: fundamental + quantitative synthesis, scenario analysis, changing expectations, portfolio risk, cross-asset context, independent challenge.',
   false),
  ('JANE_STREET_AGENT', 'Probabilistic Reasoning Agent',
   'Focus: probabilistic reasoning, expected value, uncertainty, market-implied information, tail risk, alternative explanations.',
   false),
  ('HRT_AGENT', 'Quantitative Signal Agent',
   'Focus: quantitative relationships, machine-learning discipline, signal robustness, nonlinear relationships, overfitting detection, distribution shift.',
   false),
  ('OPTIVER_AGENT', 'Probability & Volatility Agent',
   'Focus: probability distributions, volatility, market pricing, simulation, expected value, changing probabilities.',
   false),
  ('JUMP_AGENT', 'Signal Discovery Agent',
   'Focus: signal discovery, systematic experimentation, novel combinations of data, research velocity, hypothesis generation.',
   false),
  ('DRUCKENMILLER_AGENT', 'Macro Agent',
   'Focus: macro inflections, liquidity, rates, expectations, price action, regime change, asymmetry, catalysts, willingness to change view.',
   false),
  ('ARK_AGENT', 'Disruptive Innovation Agent',
   'Focus: disruptive innovation, technology cost curves, S-curve adoption, technological convergence, disruption winners and victims, long-duration nonlinear growth.',
   false);
