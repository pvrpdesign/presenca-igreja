alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.visitors enable row level security;
alter table public.pastors enable row level security;
alter table public.special_music enable row level security;
alter table public.services enable row level security;
alter table public.attendances enable row level security;
alter table public.member_followups enable row level security;
alter table public.visitor_followups enable row level security;
alter table public.visitor_sensitive_data enable row level security;
alter table public.export_audit_logs enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "Administrators can update profiles" on public.profiles;
create policy "Administrators can update profiles"
on public.profiles for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users can register own exports" on public.export_audit_logs;
create policy "Users can register own exports"
on public.export_audit_logs for insert to authenticated
with check (user_id = auth.uid() and user_role = public.current_user_role()::text);

drop policy if exists "Leadership can read export audit logs" on public.export_audit_logs;
create policy "Leadership can read export audit logs"
on public.export_audit_logs for select to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Reception and leadership can read members" on public.members;
create policy "Reception and leadership can read members"
on public.members
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

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

drop policy if exists "Leadership can delete members" on public.members;
drop policy if exists "Administrators can delete members" on public.members;
create policy "Administrators can delete members"
on public.members
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Reception and leadership can read visitors" on public.visitors;
create policy "Reception and leadership can read visitors"
on public.visitors
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

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

drop policy if exists "Reception and leadership can delete visitors" on public.visitors;
drop policy if exists "Administrators can delete visitors" on public.visitors;
create policy "Administrators can delete visitors"
on public.visitors
for delete
to authenticated
using (public.current_user_is_admin());

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
drop policy if exists "Administrators can delete pastors" on public.pastors;
create policy "Administrators can delete pastors"
on public.pastors
for delete
to authenticated
using (public.current_user_is_admin());

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
drop policy if exists "Administrators can delete special music" on public.special_music;
create policy "Administrators can delete special music"
on public.special_music
for delete
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Reception and leadership can read services" on public.services;
create policy "Reception and leadership can read services"
on public.services
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert services" on public.services;
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

drop policy if exists "Reception can update services" on public.services;
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

drop policy if exists "Reception and leadership can read attendances" on public.attendances;
create policy "Reception and leadership can read attendances"
on public.attendances
for select
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception can insert attendances" on public.attendances;
drop policy if exists "Reception and leadership can insert attendances" on public.attendances;
create policy "Reception and leadership can insert attendances"
on public.attendances
for insert
to authenticated
with check (public.current_user_role() in ('recepcao', 'lideranca'));

drop policy if exists "Reception and leadership can delete attendances" on public.attendances;
create policy "Reception and leadership can delete attendances"
on public.attendances
for delete
to authenticated
using (public.current_user_role() in ('recepcao', 'lideranca'));

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

drop policy if exists "Leadership can read visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can read visitor sensitive data"
on public.visitor_sensitive_data for select to authenticated
using (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can insert visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can insert visitor sensitive data"
on public.visitor_sensitive_data for insert to authenticated
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can update visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can update visitor sensitive data"
on public.visitor_sensitive_data for update to authenticated
using (public.current_user_role() = 'lideranca')
with check (public.current_user_role() = 'lideranca');

drop policy if exists "Leadership can delete visitor sensitive data" on public.visitor_sensitive_data;
create policy "Leadership can delete visitor sensitive data"
on public.visitor_sensitive_data for delete to authenticated
using (public.current_user_role() = 'lideranca');

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.visitors to authenticated;
grant select, insert, update, delete on public.pastors to authenticated;
grant select, insert, update, delete on public.special_music to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, delete on public.attendances to authenticated;
grant select, insert, update on public.member_followups to authenticated;
grant select, insert, update on public.visitor_followups to authenticated;
grant select, insert, update, delete on public.visitor_sensitive_data to authenticated;
grant select, insert on public.export_audit_logs to authenticated;
