-- 028_schwab_broker_provider
-- BrokerProvider / SchwabBrokerProvider execution-policy architecture.
-- Deliberately built and tested WITHOUT real-money trading: real broker
-- order submission is a hard-disabled stub (see src/lib/broker/schwab-broker-provider.ts)
-- that refuses regardless of mode. This migration only creates the data
-- model for that policy framework — READ_ONLY / PAPER / STAGED /
-- HUMAN_APPROVAL / GUARDED_AUTO — plus the ProposedTrade pipeline
-- (risk review, policy review, approval gate, duplicate/idempotency,
-- append-only audit log). GUARDED_AUTO is additionally gated by
-- guarded_auto_unlocked, which nothing in application code ever sets true.
--
-- This is strictly downstream of, and does not modify, the Prediction
-- Warehouse or any frozen PMNTx research (predictions, blind_analyses,
-- revealed_analyses) — see docs/PHASE_1A_SCOPE_LOCK.md.

create type broker_execution_mode as enum ('READ_ONLY', 'PAPER', 'STAGED', 'HUMAN_APPROVAL', 'GUARDED_AUTO');

create table broker_system_controls (
  id boolean primary key default true,
  mode broker_execution_mode not null default 'READ_ONLY',
  -- Fail-closed: execution is disabled by default and must be explicitly
  -- enabled by an admin, mirroring ai_system_controls' kill-switch shape
  -- (020_ai_cost_guardrails.sql) but inverted-default since broker
  -- execution starts OFF rather than starting ON and needing a kill switch.
  execution_enabled boolean not null default false,
  close_only_mode boolean not null default false,
  -- Nothing in application code ever sets this true. It exists so
  -- GUARDED_AUTO has a real, auditable, admin-only gate rather than being
  -- reachable purely by setting `mode`.
  guarded_auto_unlocked boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  constraint broker_system_controls_singleton check (id)
);

create trigger broker_system_controls_set_updated_at
  before update on broker_system_controls
  for each row
  execute function set_updated_at();

insert into broker_system_controls (id) values (true);

create type proposed_trade_side as enum ('BUY', 'SELL');
create type proposed_trade_order_type as enum ('MARKET', 'LIMIT');

create type proposed_trade_status as enum (
  'PROPOSED',
  'RISK_REVIEWED',
  'POLICY_REVIEWED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'STAGED',
  'FILLED_PAPER',
  'CANCELLED',
  'INVALIDATED',
  'EXPIRED'
);

create table proposed_trades (
  id uuid primary key default gen_random_uuid(),

  -- Provenance: AI may only ever create the proposal itself (brief §9) —
  -- nothing here lets a ProposedTrade skip risk/policy/approval. Nullable
  -- because a proposal can originate from a manual admin action too.
  prediction_id uuid references predictions (id) on delete set null,
  rationale text,

  security_id uuid not null references securities (id) on delete restrict,
  side proposed_trade_side not null,
  order_type proposed_trade_order_type not null default 'MARKET',
  quantity numeric not null check (quantity > 0),
  limit_price numeric check (limit_price is null or limit_price > 0),

  -- The mode in effect at creation time — a trade always remembers what
  -- governed it even if an admin changes the global mode afterward.
  execution_mode broker_execution_mode not null,
  status proposed_trade_status not null default 'PROPOSED',

  -- Idempotency / duplicate-order prevention (brief §10).
  fingerprint text not null unique,

  risk_review_passed boolean,
  risk_review_detail jsonb,
  policy_review_passed boolean,
  policy_review_detail jsonb,

  approved_by uuid references profiles (id),
  approved_at timestamptz,
  approval_invalidated_at timestamptz,
  approval_invalidated_reason text,

  staged_at timestamptz,
  filled_paper_at timestamptz,
  filled_paper_price numeric,
  cancelled_at timestamptz,
  cancelled_reason text,

  -- The market data timestamp the risk/policy review was evaluated
  -- against — lets a later stage detect and reject on stale data (brief's
  -- "stale-data rejection" requirement) without re-deriving it.
  reviewed_against_quote_at timestamptz,

  created_at timestamptz not null default now()
);

create index proposed_trades_status_idx on proposed_trades (status, created_at desc);
create index proposed_trades_security_idx on proposed_trades (security_id);
create index proposed_trades_prediction_idx on proposed_trades (prediction_id);

create type proposed_trade_event_type as enum (
  'CREATED',
  'RISK_REVIEWED',
  'POLICY_REVIEWED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'INVALIDATED',
  'STAGED',
  'FILLED_PAPER',
  'CANCELLED',
  'EXECUTION_BLOCKED'
);

-- Append-only by convention (application layer only ever inserts); no
-- update/delete policy is granted to any role.
create table proposed_trade_events (
  id uuid primary key default gen_random_uuid(),
  proposed_trade_id uuid not null references proposed_trades (id) on delete cascade,
  event_type proposed_trade_event_type not null,
  detail jsonb,
  actor uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index proposed_trade_events_trade_idx on proposed_trade_events (proposed_trade_id, created_at);

alter table broker_system_controls enable row level security;
alter table proposed_trades enable row level security;
alter table proposed_trade_events enable row level security;

create policy "broker_system_controls_admin_only" on broker_system_controls
  for select using (is_admin());
create policy "proposed_trades_select_authenticated" on proposed_trades
  for select using (auth.role() = 'authenticated');
create policy "proposed_trade_events_select_authenticated" on proposed_trade_events
  for select using (auth.role() = 'authenticated');
