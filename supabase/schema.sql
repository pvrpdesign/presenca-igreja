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
  denomination text,
  how_heard text,
  prayer_request text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pastors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  district text,
  speaker_role text not null default 'pastor' check (speaker_role in ('pastor', 'pregador')),
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

drop trigger if exists pastors_set_updated_at on public.pastors;
create trigger pastors_set_updated_at
before update on public.pastors
for each row execute function public.set_updated_at();

drop trigger if exists special_music_set_updated_at on public.special_music;
create trigger special_music_set_updated_at
before update on public.special_music
for each row execute function public.set_updated_at();

drop trigger if exists member_followups_set_updated_at on public.member_followups;
create trigger member_followups_set_updated_at
before update on public.member_followups
for each row execute function public.set_updated_at();

drop trigger if exists visitor_followups_set_updated_at on public.visitor_followups;
create trigger visitor_followups_set_updated_at
before update on public.visitor_followups
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
alter table public.pastors enable row level security;
alter table public.special_music enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;
alter table public.member_followups enable row level security;
alter table public.visitor_followups enable row level security;

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

drop policy if exists "Leadership can delete members" on public.members;
create policy "Leadership can delete members"
on public.members
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

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

drop policy if exists "Reception and leadership can delete visitors" on public.visitors;
create policy "Reception and leadership can delete visitors"
on public.visitors
for delete
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can read pastors" on public.pastors;
create policy "Reception and leadership can read pastors"
on public.pastors
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can insert pastors" on public.pastors;
create policy "Reception and leadership can insert pastors"
on public.pastors
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can update pastors" on public.pastors;
create policy "Reception and leadership can update pastors"
on public.pastors
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can delete pastors" on public.pastors;
create policy "Leadership can delete pastors"
on public.pastors
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Reception and leadership can read special music" on public.special_music;
create policy "Reception and leadership can read special music"
on public.special_music
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can insert special music" on public.special_music;
create policy "Reception and leadership can insert special music"
on public.special_music
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can update special music" on public.special_music;
create policy "Reception and leadership can update special music"
on public.special_music
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can delete special music" on public.special_music;
create policy "Leadership can delete special music"
on public.special_music
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

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

drop policy if exists "Leadership can delete services" on public.services;
create policy "Leadership can delete services"
on public.services
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

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

drop policy if exists "Reception and leadership can delete attendances" on public.attendances;
create policy "Reception and leadership can delete attendances"
on public.attendances
for delete
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can read member followups" on public.member_followups;
create policy "Leadership can read member followups"
on public.member_followups
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert member followups" on public.member_followups;
create policy "Leadership can insert member followups"
on public.member_followups
for insert
to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update member followups" on public.member_followups;
create policy "Leadership can update member followups"
on public.member_followups
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can read visitor followups" on public.visitor_followups;
create policy "Leadership can read visitor followups"
on public.visitor_followups
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert visitor followups" on public.visitor_followups;
create policy "Leadership can insert visitor followups"
on public.visitor_followups
for insert
to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update visitor followups" on public.visitor_followups;
create policy "Leadership can update visitor followups"
on public.visitor_followups
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

create or replace function public.get_member_checkin_service(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_today date := (now() at time zone 'America/Bahia')::date;
begin
  select * into v_service from public.services where checkin_token = p_token;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'title', coalesce(v_service.title, 'Culto'),
    'service_date', v_service.service_date,
    'service_type', v_service.service_type,
    'is_open', v_service.checkin_enabled and v_service.service_date = v_today
  );
end;
$$;

create or replace function public.register_member_self_checkin(p_token uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_member public.members%rowtype;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_matches integer := 0;
  v_inserted integer := 0;
  v_today date := (now() at time zone 'America/Bahia')::date;
begin
  if left(v_phone, 2) = '55' and length(v_phone) in (12, 13) then
    v_phone := substring(v_phone from 3);
  end if;

  if length(v_phone) not in (10, 11) then
    return jsonb_build_object('status', 'invalid_phone');
  end if;

  select * into v_service from public.services where checkin_token = p_token;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not v_service.checkin_enabled or v_service.service_date <> v_today then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*)
  into v_matches
  from public.members
  where status = 'ativo'
    and (
      case
        when left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 2) = '55'
          and length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) in (12, 13)
        then substring(regexp_replace(coalesce(phone, ''), '\D', '', 'g') from 3)
        else regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      end
    ) = v_phone;

  if v_matches = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_matches > 1 then
    return jsonb_build_object('status', 'multiple_matches');
  end if;

  select *
  into v_member
  from public.members
  where status = 'ativo'
    and (
      case
        when left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 2) = '55'
          and length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) in (12, 13)
        then substring(regexp_replace(coalesce(phone, ''), '\D', '', 'g') from 3)
        else regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      end
    ) = v_phone
  limit 1;

  insert into public.attendances (
    person_id, person_type, service_id, service_date, service_type, registered_by
  )
  values (
    v_member.id, 'membro', v_service.id, v_service.service_date, v_service.service_type, null
  )
  on conflict on constraint attendances_unique_service_person do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'status', case when v_inserted = 1 then 'registered' else 'already_registered' end,
    'first_name', split_part(v_member.full_name, ' ', 1)
  );
end;
$$;

revoke all on function public.get_member_checkin_service(uuid) from public;
revoke all on function public.register_member_self_checkin(uuid, text) from public;
grant execute on function public.get_member_checkin_service(uuid) to anon, authenticated;
grant execute on function public.register_member_self_checkin(uuid, text) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.visitors to authenticated;
grant select, insert, update, delete on public.pastors to authenticated;
grant select, insert, update, delete on public.special_music to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, delete on public.attendances to authenticated;
grant select, insert, update on public.member_followups to authenticated;
grant select, insert, update on public.visitor_followups to authenticated;
