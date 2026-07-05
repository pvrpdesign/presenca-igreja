create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do '
begin
  create type public.user_role as enum (''recepcao'', ''lideranca'');
exception
  when duplicate_object then null;
end;
';

do '
begin
  create type public.member_status as enum (''ativo'', ''afastado'', ''transferido'');
exception
  when duplicate_object then null;
end;
';

do '
begin
  create type public.service_type as enum (''quarta'', ''sabado'', ''especial'');
exception
  when duplicate_object then null;
end;
';

do '
begin
  create type public.person_type as enum (''membro'', ''visitante'');
exception
  when duplicate_object then null;
end;
';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'recepcao',
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  neighborhood text,
  ministry text,
  status public.member_status not null default 'ativo',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  location text,
  how_heard text,
  prayer_request text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_type public.service_type not null,
  title text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint services_unique_date_type unique (service_date, service_type)
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  person_type public.person_type not null,
  service_id uuid not null references public.services(id) on delete cascade,
  service_date date not null,
  service_type public.service_type not null,
  registered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attendances_unique_service_person unique (service_id, person_type, person_id),
  constraint attendances_unique_date_type_person unique (service_date, service_type, person_type, person_id)
);

create index if not exists members_full_name_idx on public.members using gin (full_name gin_trgm_ops);
create index if not exists members_status_idx on public.members (status);
create index if not exists visitors_full_name_idx on public.visitors using gin (full_name gin_trgm_ops);
create index if not exists services_date_type_idx on public.services (service_date desc, service_type);
create index if not exists attendances_service_idx on public.attendances (service_id);
create index if not exists attendances_person_idx on public.attendances (person_type, person_id);
create index if not exists attendances_date_type_idx on public.attendances (service_date desc, service_type);

create or replace function public.set_updated_at() returns trigger language plpgsql as '
begin
  new.updated_at = now();
  return new;
end;
';

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists visitors_set_updated_at on public.visitors;
create trigger visitors_set_updated_at
before update on public.visitors
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as '
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> ''full_name'', new.email),
    ''recepcao''
  )
  on conflict (id) do nothing;

  return new;
end;
';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role() returns public.user_role language sql stable security definer set search_path = public as '
  select role from public.profiles where id = auth.uid()
';

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.visitors enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'lideranca');

drop policy if exists "Reception and leadership can read members" on public.members;
create policy "Reception and leadership can read members"
on public.members
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert members" on public.members;
drop policy if exists "Reception and leadership can insert members" on public.members;
create policy "Reception and leadership can insert members"
on public.members
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update members" on public.members;
drop policy if exists "Reception and leadership can update members" on public.members;
create policy "Reception and leadership can update members"
on public.members
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can read visitors" on public.visitors;
create policy "Reception and leadership can read visitors"
on public.visitors
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert visitors" on public.visitors;
drop policy if exists "Reception and leadership can insert visitors" on public.visitors;
create policy "Reception and leadership can insert visitors"
on public.visitors
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update visitors" on public.visitors;
drop policy if exists "Reception and leadership can update visitors" on public.visitors;
create policy "Reception and leadership can update visitors"
on public.visitors
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can read services" on public.services;
create policy "Reception and leadership can read services"
on public.services
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert services" on public.services;
drop policy if exists "Reception and leadership can insert services" on public.services;
create policy "Reception and leadership can insert services"
on public.services
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update services" on public.services;
drop policy if exists "Reception and leadership can update services" on public.services;
create policy "Reception and leadership can update services"
on public.services
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can read attendances" on public.attendances;
create policy "Reception and leadership can read attendances"
on public.attendances
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert attendances" on public.attendances;
drop policy if exists "Reception and leadership can insert attendances" on public.attendances;
create policy "Reception and leadership can insert attendances"
on public.attendances
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.members to authenticated;
grant select, insert, update on public.visitors to authenticated;
grant select, insert, update on public.services to authenticated;
grant select, insert on public.attendances to authenticated;
