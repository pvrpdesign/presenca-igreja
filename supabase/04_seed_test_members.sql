insert into public.members (full_name, phone, neighborhood, ministry, status, notes)
select seed.full_name, seed.phone, seed.neighborhood, seed.ministry, 'ativo'::public.member_status, seed.notes
from (
  values
    (U&'Jo\00E3o', null, null, null, 'Membro de teste'),
    ('Maria', null, null, null, 'Membro de teste'),
    (U&'Jos\00E9', null, null, null, 'Membro de teste'),
    ('Paulo', null, null, null, 'Membro de teste'),
    ('Ana', null, null, null, 'Membro de teste'),
    ('Pedro', null, null, null, 'Membro de teste'),
    ('Tiago', null, null, null, 'Membro de teste'),
    ('Lucas', null, null, null, 'Membro de teste'),
    ('Sara', null, null, null, 'Membro de teste'),
    ('Ester', null, null, null, 'Membro de teste')
) as seed(full_name, phone, neighborhood, ministry, notes)
where not exists (
  select 1
  from public.members existing
  where lower(existing.full_name) = lower(seed.full_name)
);
