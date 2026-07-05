drop policy if exists "Reception can insert members" on public.members;
drop policy if exists "Reception and leadership can insert members" on public.members;
create policy "Reception and leadership can insert members"
on public.members
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update members" on public.members;
drop policy if exists "Reception and leadership can update members" on public.members;
create policy "Reception and leadership can update members"
on public.members
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert visitors" on public.visitors;
drop policy if exists "Reception and leadership can insert visitors" on public.visitors;
create policy "Reception and leadership can insert visitors"
on public.visitors
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update visitors" on public.visitors;
drop policy if exists "Reception and leadership can update visitors" on public.visitors;
create policy "Reception and leadership can update visitors"
on public.visitors
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert services" on public.services;
drop policy if exists "Reception and leadership can insert services" on public.services;
create policy "Reception and leadership can insert services"
on public.services
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can update services" on public.services;
drop policy if exists "Reception and leadership can update services" on public.services;
create policy "Reception and leadership can update services"
on public.services
for update
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'))
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert attendances" on public.attendances;
drop policy if exists "Reception and leadership can insert attendances" on public.attendances;
create policy "Reception and leadership can insert attendances"
on public.attendances
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));
