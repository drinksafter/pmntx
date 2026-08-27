-- 038_cost_ledger
-- Extends the existing AI cost tracking (ai_executions, 020_ai_cost_guardrails.sql)
-- into a ledger covering non-AI compute too (feature computation, quant
-- scoring, training), attributable by provider/model/agent/security/
-- workflow/date/experiment/prediction. No trigger on ai_executions — that
-- would add DB-level coupling to a table the gateway writes; instead a
-- pull-based, idempotent sync function (src/lib/cost-ledger/ledger.ts)
-- reads ai_executions and writes here, keeping the gateway's write path
-- completely untouched at the schema level too.

create table cost_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  provider text not null, -- 'OPENAI' | 'ANTHROPIC' | 'INTERNAL_COMPUTE' | ...
  category text not null check (category in (
    'AI_INFERENCE', 'FEATURE_COMPUTE', 'QUANT_SCORING', 'TRAINING_COMPUTE',
    'STORAGE', 'MARKET_DATA_SUBSCRIPTION', 'ALT_DATA_SUBSCRIPTION',
    'SCHEDULED_COMPUTE', 'OTHER'
  )),
  model_version_id uuid references model_versions (id) on delete set null,
  agent_id uuid references agents (id) on delete set null,
  security_id uuid references securities (id) on delete set null,
  research_run_id uuid references research_runs (id) on delete set null,
  experiment_run_id uuid references experiment_runs (id) on delete set null,
  prediction_id uuid references predictions (id) on delete set null,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  workflow_id text,
  estimated_cost_usd numeric(12, 6),
  actual_cost_usd numeric(12, 6),
  cost_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Enables idempotent pull-sync from ai_executions: syncing the same
-- execution twice updates the same row rather than duplicating cost.
create unique index cost_ledger_entries_ai_execution_unique_idx
  on cost_ledger_entries (ai_execution_id) where ai_execution_id is not null;
create index cost_ledger_entries_date_idx on cost_ledger_entries (cost_date);
create index cost_ledger_entries_category_idx on cost_ledger_entries (category, cost_date);

alter table cost_ledger_entries enable row level security;
create policy "cost_ledger_entries_select_authenticated" on cost_ledger_entries
  for select using (auth.role() = 'authenticated');
