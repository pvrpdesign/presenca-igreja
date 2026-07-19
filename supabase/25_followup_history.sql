begin;

create or replace function public.compact_display_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when normalized.name = '' then 'Usuário sem nome'
    when normalized.name not like '% %' then normalized.name
    else split_part(normalized.name, ' ', 1) || ' ' || regexp_replace(normalized.name, '^.* ', '')
  end
  from (
    select regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g') as name
  ) as normalized;
$$;

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

create index if not exists followup_history_person_idx
on public.followup_history (person_type, person_id, performed_at desc);

create index if not exists followup_history_attendance_idx
on public.followup_history (attendance_id, performed_at desc)
where attendance_id is not null;

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
as $$
begin
  if auth.uid() is not null then
    new.performed_by := auth.uid();
    select public.compact_display_name(profile.full_name)
      into new.performed_by_name
    from public.profiles as profile
    where profile.id = auth.uid();
    new.performed_by_name := coalesce(new.performed_by_name, 'Usuário sem nome');
  end if;
  return new;
end;
$$;

drop trigger if exists followup_history_set_actor on public.followup_history;
create trigger followup_history_set_actor
before insert on public.followup_history
for each row execute function public.set_followup_history_actor();

alter table public.followup_history enable row level security;

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

grant select, insert on public.followup_history to authenticated;

commit;
