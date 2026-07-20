begin;

alter table public.system_settings
  add column if not exists member_absence_message text not null default 'Olá, {nome}! Sentimos sua falta nos últimos sábados e queremos saber como você está. Podemos orar por você?' check (char_length(trim(member_absence_message)) between 10 and 1000),
  add column if not exists visitor_absence_message text not null default 'Olá, {nome}! Sentimos sua falta na {igreja} e gostaríamos de saber como você está. Esperamos receber você novamente em breve!' check (char_length(trim(visitor_absence_message)) between 10 and 1000),
  add column if not exists visitor_thank_you_message text not null default 'Olá, {nome}! Agradecemos por ter visitado a {igreja}. Foi uma alegria receber você! Esperamos vê-lo novamente. Que Deus abençoe sua vida.' check (char_length(trim(visitor_thank_you_message)) between 10 and 1000),
  add column if not exists pastor_thank_you_message text not null default 'Olá, {nome}! Agradecemos por sua presença na {igreja} e por compartilhar a Palavra de Deus conosco. Foi uma alegria receber você! Que Deus continue abençoando sua vida e seu ministério.' check (char_length(trim(pastor_thank_you_message)) between 10 and 1000),
  add column if not exists music_thank_you_message text not null default 'Olá, {nome}! Agradecemos por ter participado conosco com a música especial na {igreja}. Foi uma alegria receber você! Que Deus abençoe sua vida e seu ministério.' check (char_length(trim(music_thank_you_message)) between 10 and 1000);

grant update (
  member_absence_message,
  visitor_absence_message,
  visitor_thank_you_message,
  pastor_thank_you_message,
  music_thank_you_message
) on public.system_settings to authenticated;

commit;
