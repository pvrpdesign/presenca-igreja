create table if not exists public.visitor_sensitive_data (
  visitor_id uuid primary key references public.visitors(id) on delete cascade,
  prayer_request text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visitors' and column_name = 'prayer_request'
  ) then
    execute $migration$
      insert into public.visitor_sensitive_data (visitor_id, prayer_request, notes)
      select id, prayer_request, notes
      from public.visitors
      where prayer_request is not null or notes is not null
      on conflict (visitor_id) do update
      set prayer_request = excluded.prayer_request,
          notes = excluded.notes,
          updated_at = now()
    $migration$;
  end if;
end;
$$;

alter table public.visitors
drop column if exists prayer_request,
drop column if exists notes;

drop trigger if exists visitor_sensitive_data_set_updated_at on public.visitor_sensitive_data;
create trigger visitor_sensitive_data_set_updated_at
before update on public.visitor_sensitive_data
for each row execute function public.set_updated_at();

alter table public.visitor_sensitive_data enable row level security;

drop policy if exists "Leadership can read visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can read visitor sensitive data"
on public.visitor_sensitive_data
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can insert visitor sensitive data"
on public.visitor_sensitive_data
for insert
to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can update visitor sensitive data"
on public.visitor_sensitive_data
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can delete visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can delete visitor sensitive data"
on public.visitor_sensitive_data
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

grant select, insert, update, delete on public.visitor_sensitive_data to authenticated;
