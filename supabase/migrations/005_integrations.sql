-- 005_integrations
-- Credential VALUES are encrypted at the application layer (AES-256-GCM,
-- see src/lib/credentials) before they ever reach this table — the
-- database only ever stores ciphertext + the IV/auth tag needed to
-- decrypt it. RLS additionally restricts SELECT to ADMIN as defense in
-- depth, but the real security boundary is "the plaintext never exists
-- outside a server-only request handler."

create type integration_service as enum (
  'QUIVER',
  'MARKET_DATA',
  'SEC_EDGAR',
  'FRED',
  'OPENAI',
  'ANTHROPIC',
  'TELNYX'
);

create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  service integration_service not null unique,
  display_name text not null,
  encrypted_value text, -- base64: iv + auth_tag + ciphertext (see src/lib/credentials)
  is_enabled boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_rotated_at timestamptz
);

create trigger integration_credentials_set_updated_at
  before update on integration_credentials
  for each row
  execute function set_updated_at();

create type integration_health_status as enum ('NOT_CONFIGURED', 'OK', 'DEGRADED', 'ERROR');

create table integration_health (
  id uuid primary key default gen_random_uuid(),
  service integration_service not null unique,
  status integration_health_status not null default 'NOT_CONFIGURED',
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger integration_health_set_updated_at
  before update on integration_health
  for each row
  execute function set_updated_at();

create table provider_usage (
  id uuid primary key default gen_random_uuid(),
  service integration_service not null,
  usage_date date not null default current_date,
  requests integer not null default 0,
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  estimated_cost_usd numeric(12, 4) not null default 0,
  created_at timestamptz not null default now(),
  unique (service, usage_date)
);

alter table integration_credentials enable row level security;
alter table integration_health enable row level security;
alter table provider_usage enable row level security;

create policy "integration_credentials_admin_only" on integration_credentials
  for select using (
    exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "integration_health_admin_only" on integration_health
  for select using (
    exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "provider_usage_admin_only" on provider_usage
  for select using (
    exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );

-- Seed a NOT_CONFIGURED health row for every service so the Admin panel
-- has something to render on first load.
insert into integration_health (service, status)
select unnest(enum_range(null::integration_service)), 'NOT_CONFIGURED';
