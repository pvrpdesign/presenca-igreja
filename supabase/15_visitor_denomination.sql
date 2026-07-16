alter table public.visitors
add column if not exists denomination text;

comment on column public.visitors.denomination is
  'Denominação informada no cadastro: Adventista ou o nome digitado quando Outra for selecionada.';
