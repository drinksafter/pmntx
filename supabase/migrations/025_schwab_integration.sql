-- 025_schwab_integration
-- Read-only Schwab market-data and account-data integration (see
-- docs/SCHWAB_INTEGRATION.md for verified API capabilities). Trading is
-- explicitly out of scope — no order/position-mutation table exists here,
-- only read snapshots. The app-level Client ID/Secret reuse the existing
-- integration_credentials mechanism (added as a new IntegrationService
-- value below); the OAuth token pair has its own lifecycle (30-min access
-- token, 7-day hard-limit refresh token) and gets its own table.

alter type integration_service add value if not exists 'SCHWAB';

create type schwab_connection_status as enum ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'ERROR');

-- Singleton-ish: Phase 1A supports one Schwab OAuth connection. Multiple
-- linked accounts under that one connection are fine (schwab_accounts
-- below); multiple independent Schwab logins are not modeled yet.
create table schwab_connection (
  id boolean primary key default true,
  status schwab_connection_status not null default 'DISCONNECTED',
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  encrypted_refresh_token text,
  refresh_token_expires_at timestamptz,
  scope text,
  connected_at timestamptz,
  connected_by uuid references profiles (id),
  last_error text,
  last_error_at timestamptz,
  last_market_data_request_at timestamptz,
  last_account_data_request_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint schwab_connection_singleton check (id)
);

create trigger schwab_connection_set_updated_at
  before update on schwab_connection
  for each row
  execute function set_updated_at();

insert into schwab_connection (id, status) values (true, 'DISCONNECTED');

-- Accounts discovered under the connection. account_number_masked is what
-- the UI ever shows; account_hash is Schwab's own opaque per-account
-- identifier (not the raw account number) required for further API
-- calls, encrypted here as defense in depth even though Schwab itself
-- already avoids exposing raw numbers through it.
create table schwab_accounts (
  id uuid primary key default gen_random_uuid(),
  account_number_masked text not null,
  encrypted_account_hash text not null,
  account_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_number_masked)
);

create trigger schwab_accounts_set_updated_at
  before update on schwab_accounts
  for each row
  execute function set_updated_at();

-- Point-in-time balance/buying-power snapshots — append-only, never
-- updated in place, so historical account state is auditable.
create table schwab_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  schwab_account_id uuid not null references schwab_accounts (id) on delete cascade,
  as_of timestamptz not null default now(),
  cash numeric,
  buying_power numeric,
  total_value numeric,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index schwab_account_snapshots_account_idx on schwab_account_snapshots (schwab_account_id, as_of desc);

create table schwab_positions (
  id uuid primary key default gen_random_uuid(),
  schwab_account_id uuid not null references schwab_accounts (id) on delete cascade,
  as_of timestamptz not null default now(),
  symbol text not null,
  security_id uuid references securities (id) on delete set null,
  quantity numeric not null,
  average_cost numeric,
  market_value numeric,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index schwab_positions_account_idx on schwab_positions (schwab_account_id, as_of desc);
create index schwab_positions_security_idx on schwab_positions (security_id);

-- Real-time/intraday quote snapshots — a different grain from the daily
-- market_prices table (migration 003), which Schwab's price-history
-- endpoint can also feed via source='SCHWAB' without a new table.
-- Freshness (LIVE/DELAYED/STALE/UNAVAILABLE) is deliberately NOT a stored
-- column — it's derived from quote_timestamp vs. now() at read time (see
-- src/lib/integrations/schwab/freshness.ts), so it can never itself go stale.
create table schwab_quotes (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  security_id uuid references securities (id) on delete set null,
  last_price numeric,
  bid numeric,
  ask numeric,
  volume bigint,
  bar_interval text, -- null for a tick/real-time quote; e.g. '1min','1day' for a bar
  quote_timestamp timestamptz not null, -- when Schwab says the quote was generated
  received_at timestamptz not null default now(), -- when PMNTx received it
  raw jsonb,
  created_at timestamptz not null default now()
);

create index schwab_quotes_symbol_idx on schwab_quotes (symbol, quote_timestamp desc);
create index schwab_quotes_security_idx on schwab_quotes (security_id, quote_timestamp desc);

alter table schwab_connection enable row level security;
alter table schwab_accounts enable row level security;
alter table schwab_account_snapshots enable row level security;
alter table schwab_positions enable row level security;
alter table schwab_quotes enable row level security;

-- Account/connection detail is admin-only (it's account-identifying,
-- even masked); quotes are research data like any other market data.
create policy "schwab_connection_admin_only" on schwab_connection
  for select using (is_admin());
create policy "schwab_accounts_admin_only" on schwab_accounts
  for select using (is_admin());
create policy "schwab_account_snapshots_admin_only" on schwab_account_snapshots
  for select using (is_admin());
create policy "schwab_positions_admin_only" on schwab_positions
  for select using (is_admin());
create policy "schwab_quotes_select_authenticated" on schwab_quotes
  for select using (auth.role() = 'authenticated');
