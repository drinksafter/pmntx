-- 008_ai_infrastructure
-- Generic AIProvider architecture (brief §9 / Prompt 2 §12) so agents and
-- PMNTX functions are never tightly coupled to one AI company.

create table ai_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- 'OPENAI' | 'ANTHROPIC' | 'TELNYX'
  name text not null,
  is_enabled boolean not null default false
);

create table ai_models (
  id uuid primary key default gen_random_uuid(),
  ai_provider_id uuid not null references ai_providers (id) on delete cascade,
  model_code text not null, -- provider's own model identifier
  display_name text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ai_provider_id, model_code)
);

-- Which model performs which PMNTX role — the whole point of the
-- abstraction is that this is admin-configurable, not hard-coded.
create table ai_routes (
  id uuid primary key default gen_random_uuid(),
  role_code text not null unique, -- 'BLIND_ANALYST' | 'INDEPENDENT_BLIND_ANALYST' | 'REVEALED_ANALYST' | 'RED_TEAM' | 'AGENT_BUFFETT' | 'AGENT_GERSTNER' | ...
  ai_model_id uuid not null references ai_models (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create trigger ai_routes_set_updated_at
  before update on ai_routes
  for each row
  execute function set_updated_at();

create table prompt_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  role_code text not null,
  description text,
  created_at timestamptz not null default now()
);

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_template_id uuid not null references prompt_templates (id) on delete cascade,
  version text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (prompt_template_id, version)
);

create index prompt_versions_template_idx on prompt_versions (prompt_template_id);

create type ai_execution_status as enum ('SUCCEEDED', 'FAILED');

-- Every AI call PMNTX makes is recorded here — the audit trail Prompt 2
-- §12 requires (provider, model, prompt version, tokens, cost, latency).
create table ai_executions (
  id uuid primary key default gen_random_uuid(),
  ai_route_id uuid references ai_routes (id) on delete set null,
  ai_model_id uuid not null references ai_models (id) on delete restrict,
  prompt_version_id uuid references prompt_versions (id) on delete set null,
  role_code text not null,
  input_hash text,
  input_summary jsonb,
  output jsonb,
  tokens_input integer,
  tokens_output integer,
  estimated_cost_usd numeric(12, 6),
  latency_ms integer,
  status ai_execution_status not null,
  error_message text,
  executed_at timestamptz not null default now()
);

create index ai_executions_role_idx on ai_executions (role_code, executed_at desc);
create index ai_executions_model_idx on ai_executions (ai_model_id);

alter table ai_providers enable row level security;
alter table ai_models enable row level security;
alter table ai_routes enable row level security;
alter table prompt_templates enable row level security;
alter table prompt_versions enable row level security;
alter table ai_executions enable row level security;

create policy "ai_config_admin_only_providers" on ai_providers
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "ai_config_admin_only_models" on ai_models
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "ai_config_admin_only_routes" on ai_routes
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "ai_config_admin_only_templates" on prompt_templates
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "ai_config_admin_only_versions" on prompt_versions
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));
create policy "ai_config_admin_only_executions" on ai_executions
  for select using (exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN'));

insert into ai_providers (code, name, is_enabled) values
  ('OPENAI', 'OpenAI', false),
  ('ANTHROPIC', 'Anthropic', false),
  ('TELNYX', 'Telnyx', false);
