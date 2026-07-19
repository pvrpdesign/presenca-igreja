drop policy if exists "Leadership can delete services" on public.services;
drop policy if exists "Administrators can delete services" on public.services;
create policy "Administrators can delete services"
on public.services
for delete
to authenticated
using (public.current_user_is_admin());

grant delete on public.services to authenticated;
