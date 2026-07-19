alter table public.profiles
add column if not exists requested_role public.user_role,
add column if not exists email text,
add column if not exists approval_status text not null default 'aprovado',
add column if not exists is_admin boolean not null default false,
add column if not exists approved_by uuid references auth.users(id) on delete set null,
add column if not exists approved_at timestamptz;

update public.profiles
set requested_role = coalesce(requested_role, role),
    approval_status = 'aprovado',
    approved_at = coalesce(approved_at, created_at)
where requested_role is null;

update public.profiles as profile
set email = auth_user.email
from auth.users as auth_user
where profile.id = auth_user.id and profile.email is null;

alter table public.profiles
alter column requested_role set default 'recepcao',
alter column requested_role set not null;

alter table public.profiles
drop constraint if exists profiles_approval_status_check;

alter table public.profiles
add constraint profiles_approval_status_check
check (approval_status in ('pendente', 'aprovado', 'rejeitado'));

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and approval_status = 'aprovado'
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_admin
    from public.profiles
    where id = auth.uid() and approval_status = 'aprovado'
  ), false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role public.user_role := case
    when new.raw_user_meta_data ->> 'requested_role' = 'lideranca'
      then 'lideranca'::public.user_role
    else 'recepcao'::public.user_role
  end;
begin
  insert into public.profiles (
    id, full_name, email, role, requested_role, approval_status, is_admin
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    new.email,
    v_requested_role,
    v_requested_role,
    'pendente',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Administrators can update profiles" on public.profiles;
create policy "Administrators can update profiles"
on public.profiles
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

grant select, update on public.profiles to authenticated;

update public.profiles as profile
set is_admin = true,
    role = 'lideranca',
    requested_role = 'lideranca',
    approval_status = 'aprovado',
    approved_at = coalesce(profile.approved_at, now())
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = 'liderancaiasdcalcada@gmail.com';
