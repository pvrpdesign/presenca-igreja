alter table public.pastors
add column if not exists speaker_role text not null default 'pastor';

update public.pastors
set speaker_role = 'pastor'
where speaker_role is null or speaker_role not in ('pastor', 'pregador');

alter table public.pastors
drop constraint if exists pastors_speaker_role_check;

alter table public.pastors
add constraint pastors_speaker_role_check
check (speaker_role in ('pastor', 'pregador'));
