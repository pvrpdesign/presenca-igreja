drop policy if exists "Leadership can delete members" on public.members;
drop policy if exists "Administrators can delete members" on public.members;
create policy "Administrators can delete members"
on public.members
for delete
to authenticated
using (public.current_user_is_admin());

grant delete on public.members to authenticated;
