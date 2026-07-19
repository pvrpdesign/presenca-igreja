create or replace function public.set_updated_at() returns trigger language plpgsql as '
begin
  new.updated_at = now();
  return new;
end;
';

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists visitors_set_updated_at on public.visitors;
create trigger visitors_set_updated_at
before update on public.visitors
for each row execute function public.set_updated_at();

drop trigger if exists pastors_set_updated_at on public.pastors;
create trigger pastors_set_updated_at
before update on public.pastors
for each row execute function public.set_updated_at();

drop trigger if exists special_music_set_updated_at on public.special_music;
create trigger special_music_set_updated_at
before update on public.special_music
for each row execute function public.set_updated_at();

drop trigger if exists member_followups_set_updated_at on public.member_followups;
create trigger member_followups_set_updated_at
before update on public.member_followups
for each row execute function public.set_updated_at();

drop trigger if exists visitor_followups_set_updated_at on public.visitor_followups;
create trigger visitor_followups_set_updated_at
before update on public.visitor_followups
for each row execute function public.set_updated_at();

drop trigger if exists visitor_sensitive_data_set_updated_at on public.visitor_sensitive_data;
create trigger visitor_sensitive_data_set_updated_at
before update on public.visitor_sensitive_data
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as '
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> ''full_name'', new.email),
    ''recepcao''
  )
  on conflict (id) do nothing;

  return new;
end;
';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role() returns public.user_role language sql stable security definer set search_path = public as '
  select role from public.profiles where id = auth.uid()
';
