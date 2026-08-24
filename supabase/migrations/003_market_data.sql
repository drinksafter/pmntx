-- 003_market_data

create type market_session_type as enum ('REGULAR', 'EARLY_CLOSE', 'HOLIDAY', 'CLOSED_WEEKEND');

-- Proper U.S. market calendar (brief §64) — do not assume every weekday is
-- a trading day. Seeded/maintained by a dedicated ingestion job, not
-- hand-maintained.
create table market_calendar (
  calendar_date date primary key,
  is_trading_day boolean not null,
  session_type market_session_type not null,
  open_time_et time,
  close_time_et time,
  created_at timestamptz not null default now()
);

create table market_prices (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  price_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  adj_close numeric,
  volume bigint,
  source text not null,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (security_id, price_date, source)
);

create index market_prices_security_id_date_idx on market_prices (security_id, price_date desc);
create index market_prices_price_date_idx on market_prices (price_date);

alter table market_calendar enable row level security;
alter table market_prices enable row level security;

create policy "market_calendar_select_authenticated" on market_calendar
  for select using (auth.role() = 'authenticated');
create policy "market_prices_select_authenticated" on market_prices
  for select using (auth.role() = 'authenticated');
