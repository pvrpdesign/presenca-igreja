create table if not exists public.export_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_role text not null check (user_role in ('recepcao', 'lideranca')),
  export_type text not null,
  file_name text not null,
  purpose text not null check (char_length(trim(purpose)) >= 5),
  record_count integer not null check (record_count >= 0),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists export_audit_logs_created_at_idx
on public.export_audit_logs (created_at desc);

create index if not exists export_audit_logs_user_idx
on public.export_audit_logs (user_id, created_at desc);

alter table public.export_audit_logs enable row level security;

drop policy if exists "Users can register own exports" on public.export_audit_logs;
create policy "Users can register own exports"
on public.export_audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and user_role = public.current_user_role()::text
);

drop policy if exists "Leadership can read export audit logs" on public.export_audit_logs;
create policy "Leadership can read export audit logs"
on public.export_audit_logs
for select
to authenticated
using (public.current_user_role() = 'lideranca');

grant select, insert on public.export_audit_logs to authenticated;
