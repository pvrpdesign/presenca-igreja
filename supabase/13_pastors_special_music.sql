create table if not exists public.pastors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  district text,
  speaker_role text not null default 'pastor' check (speaker_role in ('pastor', 'pregador')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.special_music (
  id uuid primary key default gen_random_uuid(),
  performer_name text not null,
  contact text,
  church text,
  visit_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pastors_full_name_idx on public.pastors using gin (full_name gin_trgm_ops);
create index if not exists special_music_performer_name_idx on public.special_music using gin (performer_name gin_trgm_ops);
create index if not exists special_music_visit_date_idx on public.special_music (visit_date desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as '
begin
  new.updated_at = now();
  return new;
end;
';

drop trigger if exists pastors_set_updated_at on public.pastors;
create trigger pastors_set_updated_at
before update on public.pastors
for each row execute function public.set_updated_at();

drop trigger if exists special_music_set_updated_at on public.special_music;
create trigger special_music_set_updated_at
before update on public.special_music
for each row execute function public.set_updated_at();

alter table public.pastors enable row level security;
alter table public.special_music enable row level security;

drop policy if exists "Reception and leadership can read pastors" on public.pastors;
create policy "Reception and leadership can read pastors"
on public.pastors
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can insert pastors" on public.pastors;
create policy "Reception and leadership can insert pastors"
on public.pastors
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can update pastors" on public.pastors;
create policy "Reception and leadership can update pastors"
on public.pastors
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can delete pastors" on public.pastors;
create policy "Leadership can delete pastors"
on public.pastors
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Reception and leadership can read special music" on public.special_music;
create policy "Reception and leadership can read special music"
on public.special_music
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can insert special music" on public.special_music;
create policy "Reception and leadership can insert special music"
on public.special_music
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can update special music" on public.special_music;
create policy "Reception and leadership can update special music"
on public.special_music
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Leadership can delete special music" on public.special_music;
create policy "Leadership can delete special music"
on public.special_music
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

grant select, insert, update, delete on public.pastors to authenticated;
grant select, insert, update, delete on public.special_music to authenticated;
