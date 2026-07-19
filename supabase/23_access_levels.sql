begin;

drop policy if exists "Leadership can delete members" on public.members;
drop policy if exists "Administrators can delete members" on public.members;
create policy "Administrators can delete members"
on public.members
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Reception and leadership can delete visitors" on public.visitors;
drop policy if exists "Administrators can delete visitors" on public.visitors;
create policy "Administrators can delete visitors"
on public.visitors
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Leadership can delete pastors" on public.pastors;
drop policy if exists "Administrators can delete pastors" on public.pastors;
create policy "Administrators can delete pastors"
on public.pastors
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Leadership can delete special music" on public.special_music;
drop policy if exists "Administrators can delete special music" on public.special_music;
create policy "Administrators can delete special music"
on public.special_music
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Reception and leadership can insert services" on public.services;
create policy "Reception and leadership can insert services"
on public.services
for insert
to authenticated
with check (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
);

drop policy if exists "Reception and leadership can update services" on public.services;
create policy "Reception and leadership can update services"
on public.services
for update
to authenticated
using (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
)
with check (
  public.current_user_role() = 'lideranca'
  or (
    public.current_user_role() = 'recepcao'
    and service_date = (now() at time zone 'America/Bahia')::date
  )
);

drop policy if exists "Leadership can delete services" on public.services;
drop policy if exists "Administrators can delete services" on public.services;
create policy "Administrators can delete services"
on public.services
for delete
to authenticated
using (public.current_user_is_admin());

commit;
