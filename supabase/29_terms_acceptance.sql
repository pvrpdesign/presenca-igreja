begin;

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  user_email text,
  terms_version text not null check (char_length(trim(terms_version)) between 8 and 40),
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version)
);

create index if not exists terms_acceptances_user_idx
on public.terms_acceptances (user_id, accepted_at desc);

create or replace function public.accept_current_terms(p_terms_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or char_length(trim(coalesce(p_terms_version, ''))) not between 8 and 40 then
    raise exception 'Versão dos Termos inválida.';
  end if;

  insert into public.terms_acceptances (
    user_id,
    user_name,
    user_email,
    terms_version
  )
  select
    profile.id,
    public.compact_display_name(profile.full_name),
    profile.email,
    trim(p_terms_version)
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.approval_status = 'aprovado'
  on conflict (user_id, terms_version) do nothing;
end;
$$;

alter table public.terms_acceptances enable row level security;

drop policy if exists "Users can read own terms acceptance" on public.terms_acceptances;
create policy "Users can read own terms acceptance"
on public.terms_acceptances
for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

revoke all on function public.accept_current_terms(text) from public;
grant execute on function public.accept_current_terms(text) to authenticated;

commit;
