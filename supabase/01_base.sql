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
