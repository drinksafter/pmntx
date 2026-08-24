-- 020_ai_cost_guardrails
-- Every paid AI call (OpenAI, Anthropic, Telnyx, future providers) must
-- pass through src/lib/ai/gateway.ts, which enforces the limits defined
-- here. This migration adds: admin-configurable budget limits (global and
-- per-agent), a global kill switch, an audit trail of blocked/warned
-- requests, duplicate-request fingerprinting, and the extra attribution
-- columns on ai_executions the gateway needs (research run / agent /
-- security / retry count) that weren't necessary before paid inference
-- had any workflow context to attribute to.

-- ---- budget limits ---------------------------------------------------------

create table ai_budget_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'GLOBAL', -- 'GLOBAL' | 'AGENT'
  agent_id uuid references agents (id) on delete cascade,

  max_cost_per_run_usd numeric(10, 4),
  max_cost_per_day_usd numeric(10, 4),
  max_cost_per_month_usd numeric(10, 4),
  max_cost_per_agent_per_day_usd numeric(10, 4),
  max_cost_per_security_analysis_usd numeric(10, 4),

  max_requests_per_workflow integer,
  max_requests_per_security integer,

  max_input_tokens_per_request integer,
  max_output_tokens_per_request integer,
  max_total_tokens_per_workflow integer,

  max_retries_per_request integer not null default 2,
  max_reasoning_rounds integer,
  max_execution_time_seconds integer,

  -- Fractions of the applicable budget (0.5 = 50%) at which a WARNING
  -- event is recorded. Never used to block — see ai_budget_events.
  warning_thresholds numeric[] not null default '{0.5,0.75,0.9,1.0}',

  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),

  constraint ai_budget_limits_scope_consistency check (
    (scope = 'AGENT' and agent_id is not null)
    or (scope = 'GLOBAL' and agent_id is null)
  ),
  unique (scope, agent_id)
);

create trigger ai_budget_limits_set_updated_at
  before update on ai_budget_limits
  for each row
  execute function set_updated_at();

-- Conservative Phase 1A development defaults (brief: "do not create large
-- default spending limits" — an admin raises these deliberately later).
insert into ai_budget_limits (
  scope, max_cost_per_run_usd, max_cost_per_day_usd, max_cost_per_month_usd,
  max_cost_per_agent_per_day_usd, max_cost_per_security_analysis_usd,
  max_requests_per_workflow, max_requests_per_security,
  max_input_tokens_per_request, max_output_tokens_per_request, max_total_tokens_per_workflow,
  max_retries_per_request, max_reasoning_rounds, max_execution_time_seconds
) values (
  'GLOBAL', 2.00, 10.00, 100.00,
  3.00, 0.50,
  20, 6,
  20000, 4000, 40000,
  2, 4, 180
);

-- ---- global kill switch -----------------------------------------------------

-- Singleton row (id is always true) — simpler than a settings key/value
-- table for the one boolean the gateway checks on every call.
create table ai_system_controls (
  id boolean primary key default true,
  paid_ai_disabled boolean not null default false,
  disabled_at timestamptz,
  disabled_by uuid references profiles (id),
  disabled_reason text,
  updated_at timestamptz not null default now(),
  constraint ai_system_controls_singleton check (id)
);

create trigger ai_system_controls_set_updated_at
  before update on ai_system_controls
  for each row
  execute function set_updated_at();

insert into ai_system_controls (id) values (true);

-- ---- budget/guardrail event log (the audit trail behind Admin -> Usage) ----

create type ai_budget_event_type as enum (
  'BLOCKED_RUN_BUDGET',
  'BLOCKED_DAILY_BUDGET',
  'BLOCKED_MONTHLY_BUDGET',
  'BLOCKED_AGENT_DAILY_BUDGET',
  'BLOCKED_SECURITY_BUDGET',
  'BLOCKED_REQUEST_LIMIT',
  'BLOCKED_TOKEN_LIMIT',
  'BLOCKED_RETRY_LIMIT',
  'BLOCKED_TIME_LIMIT',
  'BLOCKED_KILL_SWITCH',
  'BLOCKED_DUPLICATE',
  'BLOCKED_REASONING_ROUNDS',
  'WARNING_THRESHOLD'
);

create table ai_budget_events (
  id uuid primary key default gen_random_uuid(),
  event_type ai_budget_event_type not null,
  role_code text,
  research_run_id uuid references research_runs (id) on delete set null,
  agent_id uuid references agents (id) on delete set null,
  security_id uuid references securities (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ai_budget_events_type_idx on ai_budget_events (event_type, created_at desc);
create index ai_budget_events_run_idx on ai_budget_events (research_run_id);

-- ---- duplicate-request suppression ------------------------------------------

-- Scoped to a research_run: the same materially-identical request is
-- suppressed within one run, not globally across all time (a legitimate
-- re-run on a later day should not be treated as a duplicate).
create table ai_request_fingerprints (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs (id) on delete cascade,
  fingerprint text not null,
  role_code text not null,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (research_run_id, fingerprint)
);

-- ---- richer cost attribution on ai_executions -------------------------------

alter table ai_executions
  add column research_run_id uuid references research_runs (id) on delete set null,
  add column agent_id uuid references agents (id) on delete set null,
  add column security_id uuid references securities (id) on delete set null,
  add column workflow_id text,
  add column retries integer not null default 0;

create index ai_executions_research_run_idx on ai_executions (research_run_id);
create index ai_executions_agent_idx on ai_executions (agent_id);
create index ai_executions_security_idx on ai_executions (security_id);
create index ai_executions_executed_at_idx on ai_executions (executed_at desc);

-- ---- RLS ---------------------------------------------------------------------

alter table ai_budget_limits enable row level security;
alter table ai_system_controls enable row level security;
alter table ai_budget_events enable row level security;
alter table ai_request_fingerprints enable row level security;

create policy "ai_budget_limits_admin_only" on ai_budget_limits
  for select using (is_admin());
create policy "ai_system_controls_admin_only" on ai_system_controls
  for select using (is_admin());
create policy "ai_budget_events_admin_only" on ai_budget_events
  for select using (is_admin());
create policy "ai_request_fingerprints_admin_only" on ai_request_fingerprints
  for select using (is_admin());
