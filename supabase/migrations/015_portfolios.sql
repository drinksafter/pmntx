-- 015_portfolios
-- Paper portfolios for PMNTX Core, PMNTX Agent Selection, PMNTX Meta, and
-- each agent (brief §41 / §52). Virtual capital only — no brokerage
-- execution in Phase 1A (see docs/NEXT_PHASE.md).

create type portfolio_owner_type as enum ('PMNTX_CORE', 'PMNTX_AGENT_SELECTION', 'PMNTX_META', 'AGENT');

create table paper_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_type portfolio_owner_type not null,
  agent_id uuid references agents (id) on delete cascade,
  name text not null,
  starting_capital numeric not null default 1000000,
  created_at timestamptz not null default now(),
  constraint paper_portfolios_agent_owner_consistency
    check (
      (owner_type = 'AGENT' and agent_id is not null)
      or (owner_type != 'AGENT' and agent_id is null)
    )
);

create unique index paper_portfolios_singleton_owner_idx
  on paper_portfolios (owner_type)
  where owner_type != 'AGENT';
create unique index paper_portfolios_agent_owner_idx
  on paper_portfolios (agent_id)
  where owner_type = 'AGENT';

create type paper_position_status as enum ('OPEN', 'CLOSED');

create table paper_positions (
  id uuid primary key default gen_random_uuid(),
  paper_portfolio_id uuid not null references paper_portfolios (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  prediction_id uuid references predictions (id) on delete set null,
  entry_price numeric not null,
  entry_date date not null,
  exit_price numeric,
  exit_date date,
  quantity numeric not null,
  status paper_position_status not null default 'OPEN',
  created_at timestamptz not null default now()
);

create index paper_positions_portfolio_idx on paper_positions (paper_portfolio_id, status);
create index paper_positions_security_idx on paper_positions (security_id);

create type paper_transaction_type as enum ('BUY', 'SELL');

create table paper_transactions (
  id uuid primary key default gen_random_uuid(),
  paper_position_id uuid not null references paper_positions (id) on delete cascade,
  transaction_type paper_transaction_type not null,
  price numeric not null,
  quantity numeric not null,
  transacted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index paper_transactions_position_idx on paper_transactions (paper_position_id);

create table portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  paper_portfolio_id uuid not null references paper_portfolios (id) on delete cascade,
  as_of_date date not null,
  total_value numeric not null,
  cash numeric not null,
  realized_pnl numeric not null default 0,
  unrealized_pnl numeric not null default 0,
  drawdown numeric,
  created_at timestamptz not null default now(),
  unique (paper_portfolio_id, as_of_date)
);

create index portfolio_snapshots_portfolio_idx on portfolio_snapshots (paper_portfolio_id, as_of_date desc);

alter table paper_portfolios enable row level security;
alter table paper_positions enable row level security;
alter table paper_transactions enable row level security;
alter table portfolio_snapshots enable row level security;

create policy "paper_portfolios_select_authenticated" on paper_portfolios
  for select using (auth.role() = 'authenticated');
create policy "paper_positions_select_authenticated" on paper_positions
  for select using (auth.role() = 'authenticated');
create policy "paper_transactions_select_authenticated" on paper_transactions
  for select using (auth.role() = 'authenticated');
create policy "portfolio_snapshots_select_authenticated" on portfolio_snapshots
  for select using (auth.role() = 'authenticated');

-- Seed the four system-level portfolios. Per-agent portfolios are created
-- lazily when an agent is activated (see src/lib/agents).
insert into paper_portfolios (owner_type, name) values
  ('PMNTX_CORE', 'PMNTX Core'),
  ('PMNTX_AGENT_SELECTION', 'PMNTX Agent Selection'),
  ('PMNTX_META', 'PMNTX Meta');
