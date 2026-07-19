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
  create type public.person_type as enum (''membro'', ''visitante'', ''pastor'', ''musica'');
exception
  when duplicate_object then null;
end;
';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role public.user_role not null default 'recepcao',
  requested_role public.user_role not null default 'recepcao',
  approval_status text not null default 'pendente' check (approval_status in ('pendente', 'aprovado', 'rejeitado')),
  is_admin boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
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
  denomination text,
  how_heard text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_sensitive_data (
  visitor_id uuid primary key references public.visitors(id) on delete cascade,
  prayer_request text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_role text not null check (user_role in ('recepcao', 'lideranca')),
  export_type text not null,
  file_name text not null,
  purpose text not null check (char_length(trim(purpose)) >= 5),
  record_count integer not null check (record_count >= 0),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pastors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  district text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.special_music (
  id uuid primary key default gen_random_uuid(),
  performer_name text not null,
  contact text,
  church text,
  visit_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_type public.service_type not null,
  title text,
  checkin_token uuid not null default gen_random_uuid(),
  checkin_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint services_unique_date_type unique (service_date, service_type)
);

create unique index if not exists services_checkin_token_idx on public.services (checkin_token);

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

create table if not exists public.member_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  last_service_id uuid not null references public.services(id) on delete cascade,
  last_service_date date not null,
  absence_streak integer not null check (absence_streak >= 2),
  status text not null default 'pendente' check (status in ('pendente', 'acompanhado', 'removido')),
  notes text,
  contacted_by uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_followups_unique_member_service unique (member_id, last_service_id)
);

create table if not exists public.visitor_followups (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  last_service_id uuid not null references public.services(id) on delete cascade,
  last_service_date date not null,
  absence_streak integer not null check (absence_streak >= 2),
  status text not null default 'pendente' check (status in ('pendente', 'acompanhado', 'removido')),
  notes text,
  contacted_by uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_followups_unique_visitor_service unique (visitor_id, last_service_id)
);

create index if not exists members_full_name_idx on public.members using gin (full_name gin_trgm_ops);
create index if not exists members_status_idx on public.members (status);
create index if not exists visitors_full_name_idx on public.visitors using gin (full_name gin_trgm_ops);
create index if not exists pastors_full_name_idx on public.pastors using gin (full_name gin_trgm_ops);
create index if not exists special_music_performer_name_idx on public.special_music using gin (performer_name gin_trgm_ops);
create index if not exists special_music_visit_date_idx on public.special_music (visit_date desc);
create index if not exists services_date_type_idx on public.services (service_date desc, service_type);
create index if not exists attendances_service_idx on public.attendances (service_id);
create index if not exists attendances_person_idx on public.attendances (person_type, person_id);
create index if not exists attendances_date_type_idx on public.attendances (service_date desc, service_type);
create index if not exists member_followups_member_idx on public.member_followups (member_id);
create index if not exists member_followups_service_status_idx on public.member_followups (last_service_id, status);
create index if not exists visitor_followups_visitor_idx on public.visitor_followups (visitor_id);
create index if not exists visitor_followups_service_status_idx on public.visitor_followups (last_service_id, status);
create index if not exists export_audit_logs_created_at_idx on public.export_audit_logs (created_at desc);
create index if not exists export_audit_logs_user_idx on public.export_audit_logs (user_id, created_at desc);
