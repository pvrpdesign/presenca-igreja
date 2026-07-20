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

create or replace function public.compact_display_name(p_name text)
returns text
language sql
immutable
as '
  select case
    when normalized.name = '''' then ''Usuário sem nome''
    when normalized.name not like ''% %'' then normalized.name
    else split_part(normalized.name, '' '', 1) || '' '' || regexp_replace(normalized.name, ''^.* '', '''')
  end
  from (
    select regexp_replace(trim(coalesce(p_name, '''')), ''\s+'', '' '', ''g'') as name
  ) as normalized;
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
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
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
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
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

create table if not exists public.registry_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  person_type public.person_type not null,
  action text not null check (action in ('cadastrado', 'arquivado', 'restaurado')),
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_name text not null default 'Não identificado',
  performed_at timestamptz not null default now()
);

create table if not exists public.access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  user_email text,
  user_role text not null check (user_role in ('recepcao', 'lideranca')),
  session_id text not null unique check (char_length(session_id) between 8 and 128),
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  logout_reason text check (logout_reason in ('manual', 'inatividade'))
);

create table if not exists public.pastors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  district text,
  speaker_role text not null default 'pastor' check (speaker_role in ('pastor', 'pregador')),
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
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
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
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
  followed_up_by uuid references auth.users(id) on delete set null,
  followed_up_at timestamptz,
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

create table if not exists public.followup_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  person_type public.person_type not null,
  attendance_id uuid references public.attendances(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  action_type text not null check (
    action_type in ('mensagem', 'ligacao', 'visita', 'oracao', 'agradecimento', 'outro')
  ),
  outcome text not null check (outcome in ('realizado', 'sem_retorno')),
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_name text not null default 'Usuário sem nome',
  performed_at timestamptz not null default now()
);

create index if not exists members_full_name_idx on public.members using gin (full_name gin_trgm_ops);
create index if not exists members_status_idx on public.members (status);
create index if not exists members_archived_at_idx on public.members (archived_at);
create index if not exists visitors_full_name_idx on public.visitors using gin (full_name gin_trgm_ops);
create index if not exists visitors_archived_at_idx on public.visitors (archived_at);
create index if not exists pastors_full_name_idx on public.pastors using gin (full_name gin_trgm_ops);
create index if not exists pastors_archived_at_idx on public.pastors (archived_at);
create index if not exists special_music_performer_name_idx on public.special_music using gin (performer_name gin_trgm_ops);
create index if not exists special_music_visit_date_idx on public.special_music (visit_date desc);
create index if not exists special_music_archived_at_idx on public.special_music (archived_at);
create index if not exists services_date_type_idx on public.services (service_date desc, service_type);
create index if not exists attendances_service_idx on public.attendances (service_id);
create index if not exists attendances_person_idx on public.attendances (person_type, person_id);
create index if not exists attendances_date_type_idx on public.attendances (service_date desc, service_type);
create index if not exists member_followups_member_idx on public.member_followups (member_id);
create index if not exists member_followups_service_status_idx on public.member_followups (last_service_id, status);
create index if not exists visitor_followups_visitor_idx on public.visitor_followups (visitor_id);
create index if not exists visitor_followups_service_status_idx on public.visitor_followups (last_service_id, status);
create index if not exists followup_history_person_idx on public.followup_history (person_type, person_id, performed_at desc);
create index if not exists followup_history_attendance_idx on public.followup_history (attendance_id, performed_at desc) where attendance_id is not null;

insert into public.followup_history (
  person_id, person_type, service_id, action_type, outcome, notes, performed_by, performed_at
)
select
  followup.member_id,
  'membro'::public.person_type,
  followup.last_service_id,
  'outro',
  'realizado',
  followup.notes,
  followup.contacted_by,
  coalesce(followup.contacted_at, followup.updated_at)
from public.member_followups as followup
where followup.status = 'acompanhado'
  and not exists (
    select 1 from public.followup_history as history
    where history.person_type = 'membro'
      and history.person_id = followup.member_id
      and history.service_id = followup.last_service_id
      and history.performed_at = coalesce(followup.contacted_at, followup.updated_at)
  );

insert into public.followup_history (
  person_id, person_type, service_id, action_type, outcome, notes, performed_by, performed_at
)
select
  followup.visitor_id,
  'visitante'::public.person_type,
  followup.last_service_id,
  'outro',
  'realizado',
  followup.notes,
  followup.contacted_by,
  coalesce(followup.contacted_at, followup.updated_at)
from public.visitor_followups as followup
where followup.status = 'acompanhado'
  and not exists (
    select 1 from public.followup_history as history
    where history.person_type = 'visitante'
      and history.person_id = followup.visitor_id
      and history.service_id = followup.last_service_id
      and history.performed_at = coalesce(followup.contacted_at, followup.updated_at)
  );

insert into public.followup_history (
  person_id, person_type, attendance_id, service_id, action_type, outcome, performed_by, performed_at
)
select
  attendance.person_id,
  attendance.person_type,
  attendance.id,
  attendance.service_id,
  case when attendance.person_type in ('pastor', 'musica') then 'agradecimento' else 'mensagem' end,
  'realizado',
  attendance.followed_up_by,
  attendance.followed_up_at
from public.attendances as attendance
where attendance.followed_up_at is not null
  and attendance.person_type in ('visitante', 'pastor', 'musica')
  and not exists (
    select 1 from public.followup_history as history
    where history.attendance_id = attendance.id
      and history.performed_at = attendance.followed_up_at
  );

update public.followup_history as history
set performed_by_name = public.compact_display_name(profile.full_name)
from public.profiles as profile
where history.performed_by = profile.id;

create or replace function public.set_followup_history_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if auth.uid() is not null then
    new.performed_by := auth.uid();
    select public.compact_display_name(profile.full_name)
      into new.performed_by_name
    from public.profiles as profile
    where profile.id = auth.uid();
    new.performed_by_name := coalesce(new.performed_by_name, ''Usuário sem nome'');
  end if;
  return new;
end;
';

drop trigger if exists followup_history_set_actor on public.followup_history;
create trigger followup_history_set_actor
before insert on public.followup_history
for each row execute function public.set_followup_history_actor();

create index if not exists export_audit_logs_created_at_idx on public.export_audit_logs (created_at desc);
create index if not exists export_audit_logs_user_idx on public.export_audit_logs (user_id, created_at desc);

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

drop trigger if exists visitor_sensitive_data_set_updated_at on public.visitor_sensitive_data;
create trigger visitor_sensitive_data_set_updated_at
before update on public.visitor_sensitive_data
for each row execute function public.set_updated_at();

create or replace function public.protect_registry_archiving()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if old.archived_at is not null and public.current_user_role() is distinct from ''lideranca'' then
    raise exception ''Somente a liderança pode alterar cadastros arquivados.'';
  end if;

  if new.archived_at is distinct from old.archived_at then
    if public.current_user_role() is distinct from ''lideranca'' then
      raise exception ''Somente a liderança pode arquivar ou restaurar cadastros.'';
    end if;

    if new.archived_at is null then
      new.archived_by := null;
    else
      new.archived_by := auth.uid();
    end if;
  elsif new.archived_by is distinct from old.archived_by then
    raise exception ''O responsável pelo arquivamento é definido automaticamente.'';
  end if;

  return new;
end;
';

drop trigger if exists members_protect_archiving on public.members;
create trigger members_protect_archiving before update on public.members
for each row execute function public.protect_registry_archiving();

drop trigger if exists visitors_protect_archiving on public.visitors;
create trigger visitors_protect_archiving before update on public.visitors
for each row execute function public.protect_registry_archiving();

drop trigger if exists pastors_protect_archiving on public.pastors;
create trigger pastors_protect_archiving before update on public.pastors
for each row execute function public.protect_registry_archiving();

drop trigger if exists special_music_protect_archiving on public.special_music;
create trigger special_music_protect_archiving before update on public.special_music
for each row execute function public.protect_registry_archiving();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as '
declare
  requested_role public.user_role := case
    when new.raw_user_meta_data ->> ''requested_role'' = ''lideranca''
      then ''lideranca''::public.user_role
    else ''recepcao''::public.user_role
  end;
begin
  insert into public.profiles (id, full_name, email, role, requested_role, approval_status, is_admin)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> ''full_name''), ''''), new.email),
    new.email,
    requested_role,
    requested_role,
    ''pendente'',
    false
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
  select role from public.profiles where id = auth.uid() and approval_status = ''aprovado''
';

create or replace function public.current_user_is_admin() returns boolean language sql stable security definer set search_path = public as '
  select coalesce((select is_admin from public.profiles where id = auth.uid() and approval_status = ''aprovado''), false)
';

create or replace function public.get_followup_actor_names(p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as '
  select
    profile.id as user_id,
    case
      when normalized.name = '''' then ''Usuário sem nome''
      when normalized.name not like ''% %'' then normalized.name
      else split_part(normalized.name, '' '', 1) || '' '' || regexp_replace(normalized.name, ''^.* '', '''')
    end as display_name
  from public.profiles as profile
  cross join lateral (
    select regexp_replace(trim(coalesce(profile.full_name, '''')), ''\s+'', '' '', ''g'') as name
  ) as normalized
  where public.current_user_role() = ''lideranca''
    and profile.approval_status = ''aprovado''
    and profile.role = ''lideranca''
    and profile.id = any(coalesce(p_user_ids, array[]::uuid[]));
';

create or replace function public.log_registry_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_actor uuid;
  v_performed_at timestamptz;
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    v_action := 'cadastrado';
    v_actor := new.created_by;
    v_performed_at := new.created_at;
  elsif new.archived_at is distinct from old.archived_at then
    if new.archived_at is null then
      v_action := 'restaurado';
      v_actor := auth.uid();
      v_performed_at := now();
    else
      v_action := 'arquivado';
      v_actor := coalesce(new.archived_by, auth.uid());
      v_performed_at := new.archived_at;
    end if;
  else
    return new;
  end if;

  select public.compact_display_name(profile.full_name)
  into v_actor_name
  from public.profiles as profile
  where profile.id = v_actor;

  insert into public.registry_history (
    person_id, person_type, action, performed_by, performed_by_name, performed_at
  ) values (
    new.id,
    tg_argv[0]::public.person_type,
    v_action,
    v_actor,
    coalesce(v_actor_name, 'Não identificado'),
    v_performed_at
  )
  on conflict (person_type, person_id, action, performed_at) do nothing;

  return new;
end;
$$;

create unique index if not exists registry_history_backfill_idx
on public.registry_history (person_type, person_id, action, performed_at);

create index if not exists registry_history_person_idx
on public.registry_history (person_type, person_id, performed_at desc);

drop trigger if exists members_registry_history on public.members;
create trigger members_registry_history after insert or update on public.members
for each row execute function public.log_registry_history('membro');

drop trigger if exists visitors_registry_history on public.visitors;
create trigger visitors_registry_history after insert or update on public.visitors
for each row execute function public.log_registry_history('visitante');

drop trigger if exists pastors_registry_history on public.pastors;
create trigger pastors_registry_history after insert or update on public.pastors
for each row execute function public.log_registry_history('pastor');

drop trigger if exists special_music_registry_history on public.special_music;
create trigger special_music_registry_history after insert or update on public.special_music
for each row execute function public.log_registry_history('musica');

create or replace function public.register_access_login(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or char_length(coalesce(p_session_id, '')) not between 8 and 128 then
    raise exception 'Sessão inválida.';
  end if;

  insert into public.access_audit_logs (
    user_id, user_name, user_email, user_role, session_id
  )
  select
    profile.id,
    public.compact_display_name(profile.full_name),
    profile.email,
    profile.role::text,
    p_session_id
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.approval_status = 'aprovado'
  on conflict (session_id) do nothing;
end;
$$;

create or replace function public.register_access_logout(p_session_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_reason not in ('manual', 'inatividade') then
    raise exception 'Encerramento de sessão inválido.';
  end if;

  update public.access_audit_logs
  set
    logout_at = coalesce(logout_at, now()),
    logout_reason = coalesce(logout_reason, p_reason)
  where session_id = p_session_id
    and user_id = auth.uid();
end;
$$;

create index if not exists access_audit_logs_user_idx
on public.access_audit_logs (user_id, login_at desc);

create index if not exists access_audit_logs_login_idx
on public.access_audit_logs (login_at desc);

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.visitors enable row level security;
alter table public.pastors enable row level security;
alter table public.special_music enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;
alter table public.member_followups enable row level security;
alter table public.visitor_followups enable row level security;
alter table public.followup_history enable row level security;
alter table public.visitor_sensitive_data enable row level security;
alter table public.export_audit_logs enable row level security;
alter table public.registry_history enable row level security;
alter table public.access_audit_logs enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Administrators can update profiles" on public.profiles;
create policy "Administrators can update profiles"
on public.profiles for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users can register own exports" on public.export_audit_logs;
create policy "Users can register own exports"
on public.export_audit_logs for insert to authenticated
with check (user_id = auth.uid() and user_role = public.current_user_role()::text);

drop policy if exists "Leadership can read export audit logs" on public.export_audit_logs;
create policy "Leadership can read export audit logs"
on public.export_audit_logs for select to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can read registry history" on public.registry_history;
create policy "Leadership can read registry history"
on public.registry_history for select to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Administrators can read access audit logs" on public.access_audit_logs;
create policy "Administrators can read access audit logs"
on public.access_audit_logs for select to authenticated
using (public.current_user_is_admin());

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
drop policy if exists "Administrators can delete members" on public.members;
create policy "Administrators can delete members"
on public.members
for delete
to authenticated
using (public.current_user_is_admin());

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
drop policy if exists "Administrators can delete visitors" on public.visitors;
create policy "Administrators can delete visitors"
on public.visitors
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Reception and leadership can read pastors" on public.pastors;
create policy "Reception and leadership can read pastors"
on public.pastors
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can read visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can read visitor sensitive data"
on public.visitor_sensitive_data for select to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can insert visitor sensitive data"
on public.visitor_sensitive_data for insert to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can update visitor sensitive data"
on public.visitor_sensitive_data for update to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can delete visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can delete visitor sensitive data"
on public.visitor_sensitive_data for delete to authenticated
using (public.current_user_role() = 'lideranca');

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
drop policy if exists "Administrators can delete pastors" on public.pastors;
create policy "Administrators can delete pastors"
on public.pastors
for delete
to authenticated
using (public.current_user_is_admin());

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
drop policy if exists "Administrators can delete special music" on public.special_music;
create policy "Administrators can delete special music"
on public.special_music
for delete
to authenticated
using (public.current_user_is_admin());

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
with check (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
);

drop policy if exists "Reception can update services" on public.services;
drop policy if exists "Reception and leadership can update services" on public.services;
create policy "Reception and leadership can update services"
on public.services
for update
to authenticated
using (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
)
with check (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
);

drop policy if exists "Leadership can delete services" on public.services;
drop policy if exists "Administrators can delete services" on public.services;
create policy "Administrators can delete services"
on public.services
for delete
to authenticated
using (public.current_user_is_admin());

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

drop policy if exists "Leadership can update attendance followups" on public.attendances;
create policy "Leadership can update attendance followups"
on public.attendances
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

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

drop policy if exists "Leadership can read followup history" on public.followup_history;
create policy "Leadership can read followup history"
on public.followup_history
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert followup history" on public.followup_history;
create policy "Leadership can insert followup history"
on public.followup_history
for insert
to authenticated
with check (
  public.current_user_role() = 'lideranca'
  and performed_by = auth.uid()
);

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
    and archived_at is null
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
    and archived_at is null
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
revoke all on function public.get_followup_actor_names(uuid[]) from public;
grant execute on function public.get_followup_actor_names(uuid[]) to authenticated;

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.visitors to authenticated;
grant select, insert, update, delete on public.pastors to authenticated;
grant select, insert, update, delete on public.special_music to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, delete on public.attendances to authenticated;
grant update (followed_up_by, followed_up_at) on public.attendances to authenticated;
grant select, insert, update on public.member_followups to authenticated;
grant select, insert, update on public.visitor_followups to authenticated;
grant select, insert on public.followup_history to authenticated;
grant select, insert, update, delete on public.visitor_sensitive_data to authenticated;
grant select, insert on public.export_audit_logs to authenticated;
grant select on public.registry_history to authenticated;
grant select on public.access_audit_logs to authenticated;
revoke all on function public.register_access_login(text) from public;
revoke all on function public.register_access_logout(text, text) from public;
grant execute on function public.register_access_login(text) to authenticated;
grant execute on function public.register_access_logout(text, text) to authenticated;
