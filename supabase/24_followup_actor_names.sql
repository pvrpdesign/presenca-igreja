begin;

create or replace function public.get_followup_actor_names(p_user_ids uuid[])
returns table (
  user_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id as user_id,
    case
      when normalized.name = '' then 'Usuário sem nome'
      when normalized.name not like '% %' then normalized.name
      else split_part(normalized.name, ' ', 1) || ' ' || regexp_replace(normalized.name, '^.* ', '')
    end as display_name
  from public.profiles as profile
  cross join lateral (
    select regexp_replace(trim(coalesce(profile.full_name, '')), '\s+', ' ', 'g') as name
  ) as normalized
  where public.current_user_role() = 'lideranca'
    and profile.approval_status = 'aprovado'
    and profile.role = 'lideranca'
    and profile.id = any(coalesce(p_user_ids, array[]::uuid[]));
$$;

revoke all on function public.get_followup_actor_names(uuid[]) from public;
grant execute on function public.get_followup_actor_names(uuid[]) to authenticated;

commit;
