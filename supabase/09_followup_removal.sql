alter table public.member_followups
drop constraint if exists member_followups_status_check;

alter table public.member_followups
add constraint member_followups_status_check
check (status in ('pendente', 'acompanhado', 'removido'));
