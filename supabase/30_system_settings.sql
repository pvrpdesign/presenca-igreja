begin;

create table if not exists public.system_settings (
  id boolean primary key default true check (id),
  church_name text not null default 'IASD Calçada' check (char_length(trim(church_name)) between 2 and 100),
  privacy_contact_email text not null default 'lideranca@iasdcalcada.com.br' check (privacy_contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  member_absence_threshold integer not null default 2 check (member_absence_threshold between 1 and 12),
  visitor_absence_threshold integer not null default 4 check (visitor_absence_threshold between 1 and 12),
  session_timeout_minutes integer not null default 30 check (session_timeout_minutes between 10 and 240),
  thank_you_message text not null default 'Olá, {nome}! Agradecemos por sua presença na {igreja}. Foi uma alegria receber você! Que Deus abençoe sua vida.' check (char_length(trim(thank_you_message)) between 10 and 1000),
  invitation_message text not null default 'Olá, {nome}! Foi uma alegria receber você na {igreja}. Gostaríamos de conversar sobre uma nova participação em nossa igreja.' check (char_length(trim(invitation_message)) between 10 and 1000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;

drop policy if exists "Anyone can read system settings" on public.system_settings;
create policy "Anyone can read system settings"
on public.system_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Administrators can update system settings" on public.system_settings;
create policy "Administrators can update system settings"
on public.system_settings
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin() and id);

revoke all on public.system_settings from anon, authenticated;
grant select on public.system_settings to anon, authenticated;
grant update (
  church_name,
  privacy_contact_email,
  member_absence_threshold,
  visitor_absence_threshold,
  session_timeout_minutes,
  thank_you_message,
  invitation_message,
  updated_by,
  updated_at
) on public.system_settings to authenticated;

commit;
