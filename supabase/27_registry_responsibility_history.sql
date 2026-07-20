begin;

create table if not exists public.registry_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  person_type public.person_type not null,
  action text not null check (action in ('cadastrado', 'arquivado', 'restaurado')),
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_name text not null default 'Não identificado',
  performed_at timestamptz not null default now()
);

create index if not exists registry_history_person_idx
on public.registry_history (person_type, person_id, performed_at desc);

create unique index if not exists registry_history_backfill_idx
on public.registry_history (person_type, person_id, action, performed_at);

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
    person_id,
    person_type,
    action,
    performed_by,
    performed_by_name,
    performed_at
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

drop trigger if exists members_registry_history on public.members;
create trigger members_registry_history
after insert or update on public.members
for each row execute function public.log_registry_history('membro');

drop trigger if exists visitors_registry_history on public.visitors;
create trigger visitors_registry_history
after insert or update on public.visitors
for each row execute function public.log_registry_history('visitante');

drop trigger if exists pastors_registry_history on public.pastors;
create trigger pastors_registry_history
after insert or update on public.pastors
for each row execute function public.log_registry_history('pastor');

drop trigger if exists special_music_registry_history on public.special_music;
create trigger special_music_registry_history
after insert or update on public.special_music
for each row execute function public.log_registry_history('musica');

insert into public.registry_history (person_id, person_type, action, performed_by, performed_by_name, performed_at)
select registry.id, registry.person_type, 'cadastrado', registry.created_by,
  coalesce(public.compact_display_name(profile.full_name), 'Não identificado'), registry.created_at
from (
  select id, 'membro'::public.person_type as person_type, created_by, created_at from public.members
  union all
  select id, 'visitante'::public.person_type, created_by, created_at from public.visitors
  union all
  select id, 'pastor'::public.person_type, created_by, created_at from public.pastors
  union all
  select id, 'musica'::public.person_type, created_by, created_at from public.special_music
) as registry
left join public.profiles as profile on profile.id = registry.created_by
on conflict (person_type, person_id, action, performed_at) do nothing;

insert into public.registry_history (person_id, person_type, action, performed_by, performed_by_name, performed_at)
select registry.id, registry.person_type, 'arquivado', registry.archived_by,
  coalesce(public.compact_display_name(profile.full_name), 'Não identificado'), registry.archived_at
from (
  select id, 'membro'::public.person_type as person_type, archived_by, archived_at from public.members
  union all
  select id, 'visitante'::public.person_type, archived_by, archived_at from public.visitors
  union all
  select id, 'pastor'::public.person_type, archived_by, archived_at from public.pastors
  union all
  select id, 'musica'::public.person_type, archived_by, archived_at from public.special_music
) as registry
left join public.profiles as profile on profile.id = registry.archived_by
where registry.archived_at is not null
on conflict (person_type, person_id, action, performed_at) do nothing;

alter table public.registry_history enable row level security;

drop policy if exists "Leadership can read registry history" on public.registry_history;
create policy "Leadership can read registry history"
on public.registry_history
for select
to authenticated
using (public.current_user_role() = 'lideranca');

revoke all on public.registry_history from anon, authenticated;
grant select on public.registry_history to authenticated;

commit;
