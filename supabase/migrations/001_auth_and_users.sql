-- 001_auth_and_users
-- Profiles table extending Supabase's built-in auth.users with the role
-- PMNTX's authorization model needs. auth.users itself is managed by
-- Supabase Auth and is not modified here.

create type user_role as enum ('ADMIN', 'USER');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role user_role not null default 'USER',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on profiles (user_id);

-- Keep updated_at current on every row change. Reused by later migrations.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- New auth.users rows automatically get a profile row (default role USER).
-- The very first user in the system is promoted to ADMIN manually via the
-- Supabase SQL editor or `scripts/promote-first-admin.sql` — see README.md.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'USER');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

alter table profiles enable row level security;

-- Users can read their own profile. Admins can read every profile.
create policy "profiles_select_own_or_admin"
  on profiles for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role = 'ADMIN'
    )
  );

-- Only admins can change roles; a user may update their own display_name
-- only (role changes by non-admins are rejected by the WITH CHECK clause).
create policy "profiles_update_own_display_name_or_admin"
  on profiles for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role = 'ADMIN'
    )
    or (user_id = auth.uid() and role = (select role from profiles where user_id = auth.uid()))
  );
