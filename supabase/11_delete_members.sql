drop policy if exists "Leadership can delete members" on public.members;
create policy "Leadership can delete members"
on public.members
for delete
to authenticated
using (public.current_user_role() = 'lideranca');

grant delete on public.members to authenticated;
