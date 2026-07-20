begin;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when profile.is_admin and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
    else profile.role
  end
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.approval_status = 'aprovado'
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select profile.is_admin
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.approval_status = 'aprovado'
  ), false)
$$;

commit;
