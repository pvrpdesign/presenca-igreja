drop policy if exists "Leadership can delete services" on public.services;
create policy "Leadership can delete services"
on public.services
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

grant delete on public.services to authenticated;
