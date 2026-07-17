alter table public.services
add column if not exists checkin_token uuid not null default gen_random_uuid();

alter table public.services
add column if not exists checkin_enabled boolean not null default true;

create unique index if not exists services_checkin_token_idx
on public.services (checkin_token);

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
  select *
  into v_service
  from public.services
  where checkin_token = p_token;

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

  select *
  into v_service
  from public.services
  where checkin_token = p_token;

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
    person_id,
    person_type,
    service_id,
    service_date,
    service_type,
    registered_by
  )
  values (
    v_member.id,
    'membro',
    v_service.id,
    v_service.service_date,
    v_service.service_type,
    null
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
