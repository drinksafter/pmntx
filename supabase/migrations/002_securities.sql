-- 002_securities
-- Phase 1A universe is liquid U.S. equities (see docs/PHASE_1A_PLAN.md),
-- but the schema carries the fields needed to widen this later (ETF/ADR
-- flags, security_type) without a migration — see docs/PHASE_1A_SCOPE_LOCK.md
-- §2 "cross-asset universe fields."

create type security_type as enum ('EQUITY', 'ETF', 'ADR', 'OTHER');

create table securities (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  cik text,
  name text not null,
  exchange text,
  sector text,
  industry text,
  security_type security_type not null default 'EQUITY',
  is_etf boolean not null default false,
  is_adr boolean not null default false,
  market_cap numeric,
  is_active boolean not null default true,
  listed_at date,
  delisted_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, exchange)
);

create index securities_ticker_idx on securities (ticker);
create index securities_cik_idx on securities (cik) where cik is not null;
create index securities_is_active_idx on securities (is_active) where is_active = true;

create trigger securities_set_updated_at
  before update on securities
  for each row
  execute function set_updated_at();

-- Historical ticker changes, CUSIP/ISIN/FIGI — lets us resolve an old
-- ticker in historical data to the current security.
create type security_alias_type as enum ('TICKER_HISTORY', 'CUSIP', 'ISIN', 'FIGI');

create table security_aliases (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  alias text not null,
  alias_type security_alias_type not null,
  created_at timestamptz not null default now(),
  unique (alias, alias_type)
);

create index security_aliases_security_id_idx on security_aliases (security_id);

-- Flexible key/value metadata store for attributes that don't warrant a
-- dedicated column yet (e.g. a Hunter-specific classification).
create table security_metadata (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  key text not null,
  value jsonb not null,
  source text,
  as_of date not null default current_date,
  created_at timestamptz not null default now()
);

create index security_metadata_security_id_idx on security_metadata (security_id);
create index security_metadata_key_idx on security_metadata (key);

alter table securities enable row level security;
alter table security_aliases enable row level security;
alter table security_metadata enable row level security;

-- Research data is the product: any authenticated user can read it.
-- Only the service role (application backend / jobs) writes it.
create policy "securities_select_authenticated" on securities
  for select using (auth.role() = 'authenticated');
create policy "security_aliases_select_authenticated" on security_aliases
  for select using (auth.role() = 'authenticated');
create policy "security_metadata_select_authenticated" on security_metadata
  for select using (auth.role() = 'authenticated');
