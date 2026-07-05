drop policy if exists "Reception and leadership can delete visitors" on public.visitors;
create policy "Reception and leadership can delete visitors"
on public.visitors
for delete
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can delete attendances" on public.attendances;
create policy "Reception and leadership can delete attendances"
on public.attendances
for delete
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

grant delete on public.visitors to authenticated;
grant delete on public.attendances to authenticated;
