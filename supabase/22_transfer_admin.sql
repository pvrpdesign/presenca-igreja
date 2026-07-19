begin;

do $$
declare
  v_admin_id uuid;
begin
  select id
  into v_admin_id
  from auth.users
  where lower(email) = 'sistema@iasdcalcada.com.br'
  limit 1;

  if v_admin_id is null then
    raise exception 'O usuário sistema@iasdcalcada.com.br não foi encontrado. Cadastre e confirme esse e-mail antes de transferir a administração.';
  end if;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    requested_role,
    approval_status,
    is_admin,
    approved_by,
    approved_at
  )
  select
    auth_user.id,
    coalesce(
      nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      auth_user.email
    ),
    auth_user.email,
    'lideranca'::public.user_role,
    'lideranca'::public.user_role,
    'aprovado',
    true,
    auth_user.id,
    now()
  from auth.users as auth_user
  where auth_user.id = v_admin_id
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      email = excluded.email,
      role = excluded.role,
      requested_role = excluded.requested_role,
      approval_status = excluded.approval_status,
      is_admin = excluded.is_admin,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at;

  update public.profiles
  set is_admin = false
  where id <> v_admin_id
    and is_admin = true;
end;
$$;

commit;
