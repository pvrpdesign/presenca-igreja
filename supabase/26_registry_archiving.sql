begin;

alter table public.members
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.visitors
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.pastors
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.special_music
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists members_archived_at_idx on public.members (archived_at);
create index if not exists visitors_archived_at_idx on public.visitors (archived_at);
create index if not exists pastors_archived_at_idx on public.pastors (archived_at);
create index if not exists special_music_archived_at_idx on public.special_music (archived_at);

create or replace function public.protect_registry_archiving()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is not null and public.current_user_role() is distinct from 'lideranca' then
    raise exception 'Somente a liderança pode alterar cadastros arquivados.';
  end if;

  if new.archived_at is distinct from old.archived_at then
    if public.current_user_role() is distinct from 'lideranca' then
      raise exception 'Somente a liderança pode arquivar ou restaurar cadastros.';
    end if;

    if new.archived_at is null then
      new.archived_by := null;
    else
      new.archived_by := auth.uid();
    end if;
  elsif new.archived_by is distinct from old.archived_by then
    raise exception 'O responsável pelo arquivamento é definido automaticamente.';
  end if;

  return new;
end;
$$;

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
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if not v_service.checkin_enabled or v_service.service_date <> v_today then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*) into v_matches
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

  if v_matches = 0 then return jsonb_build_object('status', 'not_found'); end if;
  if v_matches > 1 then return jsonb_build_object('status', 'multiple_matches'); end if;

  select * into v_member
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

  insert into public.attendances (person_id, person_type, service_id, service_date, service_type, registered_by)
  values (v_member.id, 'membro', v_service.id, v_service.service_date, v_service.service_type, null)
  on conflict on constraint attendances_unique_service_person do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object(
    'status', case when v_inserted = 1 then 'registered' else 'already_registered' end,
    'first_name', split_part(v_member.full_name, ' ', 1)
  );
end;
$$;

commit;
