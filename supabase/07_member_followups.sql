create table if not exists public.member_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  last_service_id uuid not null references public.services(id) on delete cascade,
  last_service_date date not null,
  absence_streak integer not null check (absence_streak >= 2),
  status text not null default 'pendente' check (status in ('pendente', 'acompanhado')),
  notes text,
  contacted_by uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_followups_unique_member_service unique (member_id, last_service_id)
);

create index if not exists member_followups_member_idx on public.member_followups (member_id);
create index if not exists member_followups_service_status_idx on public.member_followups (last_service_id, status);

create or replace function public.set_updated_at() returns trigger language plpgsql as '
begin
  new.updated_at = now();
  return new;
end;
';

drop trigger if exists member_followups_set_updated_at on public.member_followups;
create trigger member_followups_set_updated_at
before update on public.member_followups
for each row execute function public.set_updated_at();

alter table public.member_followups enable row level security;

drop policy if exists "Leadership can read member followups" on public.member_followups;
create policy "Leadership can read member followups"
on public.member_followups
for select
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert member followups" on public.member_followups;
create policy "Leadership can insert member followups"
on public.member_followups
for insert
to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update member followups" on public.member_followups;
create policy "Leadership can update member followups"
on public.member_followups
for update
to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

grant select, insert, update on public.member_followups to authenticated;
