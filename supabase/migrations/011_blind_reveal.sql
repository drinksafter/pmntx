-- 011_blind_reveal

create table blind_analyses (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities (id) on delete cascade,
  research_run_id uuid not null references research_runs (id) on delete cascade,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  provider_code text not null,
  model_code text not null,
  prompt_version_id uuid references prompt_versions (id) on delete set null,
  anonymized_packet jsonb not null,
  recommendation idea_direction,
  probabilities jsonb,
  reasoning text,
  risk_factors text,
  forecast_horizons_supported text[],
  confidence numeric check (confidence between 0 and 1),
  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create index blind_analyses_security_idx on blind_analyses (security_id);
create index blind_analyses_run_idx on blind_analyses (research_run_id);

create table revealed_analyses (
  id uuid primary key default gen_random_uuid(),
  blind_analysis_id uuid not null references blind_analyses (id) on delete cascade,
  security_id uuid not null references securities (id) on delete cascade,
  ai_execution_id uuid references ai_executions (id) on delete set null,
  provider_code text not null,
  model_code text not null,
  prompt_version_id uuid references prompt_versions (id) on delete set null,
  recommendation idea_direction,
  probabilities jsonb,
  reasoning text,
  -- how much the view changed after identity was revealed (brief §15) —
  -- computed at write time from blind vs. revealed recommendation/probabilities
  narrative_adjustment numeric,
  frozen_at timestamptz,
  created_at timestamptz not null default now()
);

create index revealed_analyses_blind_idx on revealed_analyses (blind_analysis_id);

-- Same immutability pattern as predictions: once frozen, no edits.
create or replace function reject_frozen_row_mutation()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'DELETE') then
    if OLD.frozen_at is not null then
      raise exception '%: row % is frozen and cannot be deleted', TG_TABLE_NAME, OLD.id;
    end if;
    return OLD;
  end if;
  if OLD.frozen_at is not null then
    raise exception '%: row % is frozen and cannot be modified', TG_TABLE_NAME, OLD.id;
  end if;
  return NEW;
end;
$$;

create trigger blind_analyses_immutability
  before update or delete on blind_analyses
  for each row
  execute function reject_frozen_row_mutation();

create trigger revealed_analyses_immutability
  before update or delete on revealed_analyses
  for each row
  execute function reject_frozen_row_mutation();

alter table blind_analyses enable row level security;
alter table revealed_analyses enable row level security;

create policy "blind_analyses_select_frozen_or_admin" on blind_analyses
  for select using (
    frozen_at is not null
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
create policy "revealed_analyses_select_frozen_or_admin" on revealed_analyses
  for select using (
    frozen_at is not null
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'ADMIN')
  );
