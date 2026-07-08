create table if not exists public.visitor_followups (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  last_service_id uuid not null references public.services(id) on delete cascade,
  last_service_date date not null,
  absence_streak integer not null check (absence_streak >= 2),
  status text not null default 'pendente' check (status in ('pendente', 'acompanhado', 'removido')),
  notes text,
  contacted_by uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_followups_unique_visitor_service unique (visitor_id, last_service_id)
);

create index if not exists visitor_followups_visitor_idx on public.visitor_followups (visitor_id);
create index if not exists visitor_followups_service_status_idx on public.visitor_followups (last_service_id, status);

alter table public.visitor_followups
drop constraint if exists visitor_followups_status_check;

alter table public.visitor_followups
add constraint visitor_followups_status_check
check (status in ('pendente', 'acompanhado', 'removido'));

create or replace function public.set_updated_at() returns trigger language plpgsql as '
begin
  new.updated_at = now();
  return new;
end;
';

drop trigger if exists visitor_followups_set_updated_at on public.visitor_followups;
create trigger visitor_followups_set_updated_at
before update on public.visitor_followups
for each row execute function public.set_updated_at();

alter table public.visitor_followups enable row level security;

drop policy if exists "Leadership can read visitor followups" on public.visitor_followups;
create policy "Leadership can read visitor followups"
on public.visitor_followups
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert visitor followups" on public.visitor_followups;
create policy "Leadership can insert visitor followups"
on public.visitor_followups
for insert
to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update visitor followups" on public.visitor_followups;
create policy "Leadership can update visitor followups"
on public.visitor_followups
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

grant select, insert, update on public.visitor_followups to authenticated;
