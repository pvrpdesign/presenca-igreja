begin;

create table if not exists public.person_merge_logs (
  id uuid primary key default gen_random_uuid(),
  person_type public.person_type not null,
  primary_person_id uuid not null,
  duplicate_person_id uuid not null,
  primary_name text not null,
  duplicate_name text not null,
  primary_snapshot jsonb not null default '{}'::jsonb,
  duplicate_snapshot jsonb not null default '{}'::jsonb,
  merged_by uuid references auth.users(id) on delete set null,
  merged_by_name text not null,
  merged_at timestamptz not null default now()
);

create index if not exists person_merge_logs_merged_at_idx
on public.person_merge_logs (merged_at desc);

alter table public.person_merge_logs enable row level security;

drop policy if exists "Administrators can read person merge logs" on public.person_merge_logs;
create policy "Administrators can read person merge logs"
on public.person_merge_logs for select to authenticated
using (public.current_user_is_admin());

create or replace function public.merge_duplicate_person(
  p_person_type public.person_type,
  p_primary_id uuid,
  p_duplicate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_name text;
  v_duplicate_name text;
  v_primary_snapshot jsonb;
  v_duplicate_snapshot jsonb;
  v_actor_name text;
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente para continuar.';
  end if;

  if not public.current_user_is_admin() then
    raise exception 'Somente o administrador pode unificar cadastros.';
  end if;

  if p_primary_id is null or p_duplicate_id is null or p_primary_id = p_duplicate_id then
    raise exception 'Escolha dois cadastros diferentes.';
  end if;

  select public.compact_display_name(profile.full_name)
  into v_actor_name
  from public.profiles as profile
  where profile.id = auth.uid();

  v_actor_name := coalesce(v_actor_name, 'Administrador');

  if p_person_type = 'membro' then
    select member.full_name, to_jsonb(member)
    into v_primary_name, v_primary_snapshot
    from public.members as member
    where member.id = p_primary_id;

    if not found then
      raise exception 'O cadastro principal não foi encontrado.';
    end if;

    select member.full_name, to_jsonb(member)
    into v_duplicate_name, v_duplicate_snapshot
    from public.members as member
    where member.id = p_duplicate_id;

    if not found then
      raise exception 'O cadastro duplicado não foi encontrado.';
    end if;

    update public.members as primary_member
    set
      phone = coalesce(nullif(trim(primary_member.phone), ''), nullif(trim(duplicate_member.phone), '')),
      neighborhood = coalesce(nullif(trim(primary_member.neighborhood), ''), nullif(trim(duplicate_member.neighborhood), '')),
      ministry = coalesce(nullif(trim(primary_member.ministry), ''), nullif(trim(duplicate_member.ministry), '')),
      notes = case
        when nullif(trim(primary_member.notes), '') is null then duplicate_member.notes
        when nullif(trim(duplicate_member.notes), '') is null
          or trim(primary_member.notes) = trim(duplicate_member.notes) then primary_member.notes
        else primary_member.notes || E'\n\n' || duplicate_member.notes
      end,
      updated_at = now()
    from public.members as duplicate_member
    where primary_member.id = p_primary_id
      and duplicate_member.id = p_duplicate_id;

    update public.member_followups as primary_followup
    set
      absence_streak = greatest(primary_followup.absence_streak, duplicate_followup.absence_streak),
      status = case
        when primary_followup.status = 'acompanhado' or duplicate_followup.status = 'acompanhado' then 'acompanhado'
        when primary_followup.status = 'pendente' or duplicate_followup.status = 'pendente' then 'pendente'
        else 'removido'
      end,
      notes = case
        when nullif(trim(primary_followup.notes), '') is null then duplicate_followup.notes
        when nullif(trim(duplicate_followup.notes), '') is null
          or trim(primary_followup.notes) = trim(duplicate_followup.notes) then primary_followup.notes
        else primary_followup.notes || E'\n\n' || duplicate_followup.notes
      end,
      contacted_by = coalesce(primary_followup.contacted_by, duplicate_followup.contacted_by),
      contacted_at = coalesce(primary_followup.contacted_at, duplicate_followup.contacted_at),
      updated_at = now()
    from public.member_followups as duplicate_followup
    where primary_followup.member_id = p_primary_id
      and duplicate_followup.member_id = p_duplicate_id
      and primary_followup.last_service_id = duplicate_followup.last_service_id;

    delete from public.member_followups as duplicate_followup
    using public.member_followups as primary_followup
    where duplicate_followup.member_id = p_duplicate_id
      and primary_followup.member_id = p_primary_id
      and duplicate_followup.last_service_id = primary_followup.last_service_id;

    update public.member_followups
    set member_id = p_primary_id, updated_at = now()
    where member_id = p_duplicate_id;

  elsif p_person_type = 'visitante' then
    select visitor.full_name, to_jsonb(visitor)
    into v_primary_name, v_primary_snapshot
    from public.visitors as visitor
    where visitor.id = p_primary_id;

    if not found then
      raise exception 'O cadastro principal não foi encontrado.';
    end if;

    select visitor.full_name, to_jsonb(visitor)
    into v_duplicate_name, v_duplicate_snapshot
    from public.visitors as visitor
    where visitor.id = p_duplicate_id;

    if not found then
      raise exception 'O cadastro duplicado não foi encontrado.';
    end if;

    update public.visitors as primary_visitor
    set
      phone = coalesce(nullif(trim(primary_visitor.phone), ''), nullif(trim(duplicate_visitor.phone), '')),
      location = coalesce(nullif(trim(primary_visitor.location), ''), nullif(trim(duplicate_visitor.location), '')),
      denomination = coalesce(nullif(trim(primary_visitor.denomination), ''), nullif(trim(duplicate_visitor.denomination), '')),
      how_heard = coalesce(nullif(trim(primary_visitor.how_heard), ''), nullif(trim(duplicate_visitor.how_heard), '')),
      updated_at = now()
    from public.visitors as duplicate_visitor
    where primary_visitor.id = p_primary_id
      and duplicate_visitor.id = p_duplicate_id;

    insert into public.visitor_sensitive_data as primary_sensitive (
      visitor_id, prayer_request, notes, created_by, updated_by
    )
    select
      p_primary_id,
      duplicate_sensitive.prayer_request,
      duplicate_sensitive.notes,
      duplicate_sensitive.created_by,
      auth.uid()
    from public.visitor_sensitive_data as duplicate_sensitive
    where duplicate_sensitive.visitor_id = p_duplicate_id
    on conflict (visitor_id) do update
    set
      prayer_request = case
        when nullif(trim(primary_sensitive.prayer_request), '') is null then excluded.prayer_request
        when nullif(trim(excluded.prayer_request), '') is null
          or trim(primary_sensitive.prayer_request) = trim(excluded.prayer_request) then primary_sensitive.prayer_request
        else primary_sensitive.prayer_request || E'\n\n' || excluded.prayer_request
      end,
      notes = case
        when nullif(trim(primary_sensitive.notes), '') is null then excluded.notes
        when nullif(trim(excluded.notes), '') is null
          or trim(primary_sensitive.notes) = trim(excluded.notes) then primary_sensitive.notes
        else primary_sensitive.notes || E'\n\n' || excluded.notes
      end,
      updated_by = auth.uid(),
      updated_at = now();

    update public.visitor_followups as primary_followup
    set
      absence_streak = greatest(primary_followup.absence_streak, duplicate_followup.absence_streak),
      status = case
        when primary_followup.status = 'acompanhado' or duplicate_followup.status = 'acompanhado' then 'acompanhado'
        when primary_followup.status = 'pendente' or duplicate_followup.status = 'pendente' then 'pendente'
        else 'removido'
      end,
      notes = case
        when nullif(trim(primary_followup.notes), '') is null then duplicate_followup.notes
        when nullif(trim(duplicate_followup.notes), '') is null
          or trim(primary_followup.notes) = trim(duplicate_followup.notes) then primary_followup.notes
        else primary_followup.notes || E'\n\n' || duplicate_followup.notes
      end,
      contacted_by = coalesce(primary_followup.contacted_by, duplicate_followup.contacted_by),
      contacted_at = coalesce(primary_followup.contacted_at, duplicate_followup.contacted_at),
      updated_at = now()
    from public.visitor_followups as duplicate_followup
    where primary_followup.visitor_id = p_primary_id
      and duplicate_followup.visitor_id = p_duplicate_id
      and primary_followup.last_service_id = duplicate_followup.last_service_id;

    delete from public.visitor_followups as duplicate_followup
    using public.visitor_followups as primary_followup
    where duplicate_followup.visitor_id = p_duplicate_id
      and primary_followup.visitor_id = p_primary_id
      and duplicate_followup.last_service_id = primary_followup.last_service_id;

    update public.visitor_followups
    set visitor_id = p_primary_id, updated_at = now()
    where visitor_id = p_duplicate_id;

  elsif p_person_type = 'pastor' then
    select pastor.full_name, to_jsonb(pastor)
    into v_primary_name, v_primary_snapshot
    from public.pastors as pastor
    where pastor.id = p_primary_id;

    if not found then
      raise exception 'O cadastro principal não foi encontrado.';
    end if;

    select pastor.full_name, to_jsonb(pastor)
    into v_duplicate_name, v_duplicate_snapshot
    from public.pastors as pastor
    where pastor.id = p_duplicate_id;

    if not found then
      raise exception 'O cadastro duplicado não foi encontrado.';
    end if;

    update public.pastors as primary_pastor
    set
      phone = coalesce(nullif(trim(primary_pastor.phone), ''), nullif(trim(duplicate_pastor.phone), '')),
      district = coalesce(nullif(trim(primary_pastor.district), ''), nullif(trim(duplicate_pastor.district), '')),
      updated_at = now()
    from public.pastors as duplicate_pastor
    where primary_pastor.id = p_primary_id
      and duplicate_pastor.id = p_duplicate_id;

  elsif p_person_type = 'musica' then
    select music.performer_name, to_jsonb(music)
    into v_primary_name, v_primary_snapshot
    from public.special_music as music
    where music.id = p_primary_id;

    if not found then
      raise exception 'O cadastro principal não foi encontrado.';
    end if;

    select music.performer_name, to_jsonb(music)
    into v_duplicate_name, v_duplicate_snapshot
    from public.special_music as music
    where music.id = p_duplicate_id;

    if not found then
      raise exception 'O cadastro duplicado não foi encontrado.';
    end if;

    update public.special_music as primary_music
    set
      contact = coalesce(nullif(trim(primary_music.contact), ''), nullif(trim(duplicate_music.contact), '')),
      church = coalesce(nullif(trim(primary_music.church), ''), nullif(trim(duplicate_music.church), '')),
      updated_at = now()
    from public.special_music as duplicate_music
    where primary_music.id = p_primary_id
      and duplicate_music.id = p_duplicate_id;
  else
    raise exception 'Tipo de cadastro inválido.';
  end if;

  update public.attendances as primary_attendance
  set
    followed_up_by = coalesce(primary_attendance.followed_up_by, duplicate_attendance.followed_up_by),
    followed_up_at = coalesce(primary_attendance.followed_up_at, duplicate_attendance.followed_up_at)
  from public.attendances as duplicate_attendance
  where primary_attendance.person_type = p_person_type
    and primary_attendance.person_id = p_primary_id
    and duplicate_attendance.person_type = p_person_type
    and duplicate_attendance.person_id = p_duplicate_id
    and primary_attendance.service_id = duplicate_attendance.service_id;

  update public.followup_history as history
  set attendance_id = primary_attendance.id
  from public.attendances as duplicate_attendance
  join public.attendances as primary_attendance
    on primary_attendance.person_type = duplicate_attendance.person_type
   and primary_attendance.service_id = duplicate_attendance.service_id
   and primary_attendance.person_id = p_primary_id
  where history.attendance_id = duplicate_attendance.id
    and duplicate_attendance.person_type = p_person_type
    and duplicate_attendance.person_id = p_duplicate_id;

  delete from public.attendances as duplicate_attendance
  using public.attendances as primary_attendance
  where duplicate_attendance.person_type = p_person_type
    and duplicate_attendance.person_id = p_duplicate_id
    and primary_attendance.person_type = p_person_type
    and primary_attendance.person_id = p_primary_id
    and duplicate_attendance.service_id = primary_attendance.service_id;

  update public.attendances
  set person_id = p_primary_id
  where person_type = p_person_type
    and person_id = p_duplicate_id;

  update public.followup_history
  set person_id = p_primary_id
  where person_type = p_person_type
    and person_id = p_duplicate_id;

  update public.registry_history
  set person_id = p_primary_id
  where person_type = p_person_type
    and person_id = p_duplicate_id;

  insert into public.person_merge_logs (
    person_type,
    primary_person_id,
    duplicate_person_id,
    primary_name,
    duplicate_name,
    primary_snapshot,
    duplicate_snapshot,
    merged_by,
    merged_by_name
  ) values (
    p_person_type,
    p_primary_id,
    p_duplicate_id,
    v_primary_name,
    v_duplicate_name,
    v_primary_snapshot,
    v_duplicate_snapshot,
    auth.uid(),
    v_actor_name
  );

  if p_person_type = 'membro' then
    delete from public.members where id = p_duplicate_id;
  elsif p_person_type = 'visitante' then
    delete from public.visitors where id = p_duplicate_id;
  elsif p_person_type = 'pastor' then
    delete from public.pastors where id = p_duplicate_id;
  else
    delete from public.special_music where id = p_duplicate_id;
  end if;

  return jsonb_build_object(
    'status', 'merged',
    'primary_id', p_primary_id,
    'primary_name', v_primary_name,
    'duplicate_name', v_duplicate_name
  );
end;
$$;

revoke all on public.person_merge_logs from anon, authenticated;
grant select on public.person_merge_logs to authenticated;
revoke all on function public.merge_duplicate_person(public.person_type, uuid, uuid) from public;
grant execute on function public.merge_duplicate_person(public.person_type, uuid, uuid) to authenticated;

commit;
