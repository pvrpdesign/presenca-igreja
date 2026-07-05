insert into public.members (full_name, status, notes)
select U&'Jo\00E3o', 'ativo'::public.member_status, 'Membro criado para teste de presenca'
where not exists (
  select 1
  from public.members
  where lower(full_name) = lower(U&'Jo\00E3o')
);

insert into public.services (service_date, service_type, title)
values ('2026-07-02', 'quarta'::public.service_type, 'Quarta - 02/07/2026')
on conflict (service_date, service_type)
do update set title = excluded.title;

insert into public.attendances (
  person_id,
  person_type,
  service_id,
  service_date,
  service_type
)
select
  members.id,
  'membro'::public.person_type,
  services.id,
  services.service_date,
  services.service_type
from public.members
cross join public.services
where
  lower(members.full_name) = lower(U&'Jo\00E3o')
  and services.service_date = '2026-07-02'
  and services.service_type = 'quarta'
on conflict (service_date, service_type, person_type, person_id) do nothing;

select
  services.service_date as data_culto,
  services.service_type as tipo_culto,
  services.title as culto,
  members.full_name as pessoa,
  attendances.person_type as tipo_pessoa,
  attendances.created_at as presenca_criada_em
from public.attendances
join public.services on services.id = attendances.service_id
join public.members on members.id = attendances.person_id
where
  attendances.service_date = '2026-07-02'
  and attendances.service_type = 'quarta'
  and attendances.person_type = 'membro'
  and lower(members.full_name) = lower(U&'Jo\00E3o');
