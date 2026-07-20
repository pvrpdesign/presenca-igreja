begin;

create table if not exists public.access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  user_email text,
  user_role text not null check (user_role in ('recepcao', 'lideranca')),
  session_id text not null unique check (char_length(session_id) between 8 and 128),
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  logout_reason text check (logout_reason in ('manual', 'inatividade'))
);

create index if not exists access_audit_logs_user_idx
on public.access_audit_logs (user_id, login_at desc);

create index if not exists access_audit_logs_login_idx
on public.access_audit_logs (login_at desc);

create or replace function public.register_access_login(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or char_length(coalesce(p_session_id, '')) not between 8 and 128 then
    raise exception 'Sessão inválida.';
  end if;

  insert into public.access_audit_logs (
    user_id,
    user_name,
    user_email,
    user_role,
    session_id
  )
  select
    profile.id,
    public.compact_display_name(profile.full_name),
    profile.email,
    profile.role::text,
    p_session_id
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.approval_status = 'aprovado'
  on conflict (session_id) do nothing;
end;
$$;

create or replace function public.register_access_logout(p_session_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_reason not in ('manual', 'inatividade') then
    raise exception 'Encerramento de sessão inválido.';
  end if;

  update public.access_audit_logs
  set
    logout_at = coalesce(logout_at, now()),
    logout_reason = coalesce(logout_reason, p_reason)
  where session_id = p_session_id
    and user_id = auth.uid();
end;
$$;

alter table public.access_audit_logs enable row level security;

drop policy if exists "Administrators can read access audit logs" on public.access_audit_logs;
create policy "Administrators can read access audit logs"
on public.access_audit_logs
for select
to authenticated
using (public.current_user_is_admin());

revoke all on public.access_audit_logs from anon, authenticated;
grant select on public.access_audit_logs to authenticated;

revoke all on function public.register_access_login(text) from public;
revoke all on function public.register_access_logout(text, text) from public;
grant execute on function public.register_access_login(text) to authenticated;
grant execute on function public.register_access_logout(text, text) to authenticated;

commit;
