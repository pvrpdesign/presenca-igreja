begin;

alter table public.services
add column if not exists closed_at timestamptz;

alter table public.services
add column if not exists closed_by uuid references auth.users(id) on delete set null;

create index if not exists services_closed_at_idx
on public.services (closed_at);

create or replace function public.close_service(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_today date := (now() at time zone 'America/Bahia')::date;
begin
  if auth.uid() is null or public.current_user_role() <> 'lideranca' then
    raise exception 'Somente a liderança pode encerrar um culto.';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
  for update;

  if not found then
    raise exception 'Culto não encontrado.';
  end if;

  if v_service.closed_at is not null then
    return jsonb_build_object('status', 'already_closed');
  end if;

  if v_service.service_date > v_today then
    raise exception 'Não é possível encerrar um culto futuro.';
  end if;

  update public.services
  set
    closed_at = now(),
    closed_by = auth.uid(),
    checkin_enabled = false
  where id = p_service_id;

  return jsonb_build_object('status', 'closed');
end;
$$;

create or replace function public.reopen_service(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_today date := (now() at time zone 'America/Bahia')::date;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Somente o administrador pode reabrir um culto.';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
  for update;

  if not found then
    raise exception 'Culto não encontrado.';
  end if;

  if v_service.closed_at is null then
    return jsonb_build_object('status', 'already_open');
  end if;

  update public.services
  set
    closed_at = null,
    closed_by = null,
    checkin_enabled = (service_date = v_today)
  where id = p_service_id;

  return jsonb_build_object('status', 'reopened');
end;
$$;

drop policy if exists "Reception and leadership can update services" on public.services;
create policy "Reception and leadership can update open services"
on public.services
for update
to authenticated
using (
  closed_at is null
  and (
    public.current_user_role() = 'lideranca'
    or (
      public.current_user_role() = 'recepcao'
      and service_date = (now() at time zone 'America/Bahia')::date
    )
  )
)
with check (
  closed_at is null
  and (
    public.current_user_role() = 'lideranca'
    or (
      public.current_user_role() = 'recepcao'
      and service_date = (now() at time zone 'America/Bahia')::date
    )
  )
);

drop policy if exists "Administrators can delete services" on public.services;
create policy "Administrators can delete open services"
on public.services
for delete
to authenticated
using (closed_at is null and public.current_user_is_admin());

drop policy if exists "Reception and leadership can insert attendances" on public.attendances;
create policy "Reception and leadership can insert attendances in open services"
on public.attendances
for insert
to authenticated
with check (
  public.current_user_role() in ('recepcao', 'lideranca')
  and exists (
    select 1
    from public.services as service
    where service.id = attendances.service_id
      and service.closed_at is null
  )
);

drop policy if exists "Reception and leadership can delete attendances" on public.attendances;
create policy "Reception and leadership can delete attendances in open services"
on public.attendances
for delete
to authenticated
using (
  public.current_user_role() in ('recepcao', 'lideranca')
  and exists (
    select 1
    from public.services as service
    where service.id = attendances.service_id
      and service.closed_at is null
  )
);

revoke update on public.services from authenticated;
grant update (service_date, service_type, title) on public.services to authenticated;

revoke all on function public.close_service(uuid) from public;
revoke all on function public.reopen_service(uuid) from public;
grant execute on function public.close_service(uuid) to authenticated;
grant execute on function public.reopen_service(uuid) to authenticated;

commit;
