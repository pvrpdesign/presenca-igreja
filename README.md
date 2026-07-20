# Controle de Presença de Igreja

App web responsivo para a recepção registrar presença de membros e visitantes por culto, com dashboard, cadastros, check-in rápido e relatórios para liderança.

## Stack

- Next.js
- Supabase Auth + Database
- Tailwind CSS
- Lucide React

## Funcionalidades

- Login por e-mail e senha.
- Perfil `recepcao`: cadastra membros, cadastra visitantes e registra presença.
- Perfil `lideranca`: acessa todo o sistema, incluindo cadastros, check-in e relatórios.
- Dashboard com total de presentes, membros presentes e visitantes presentes no culto selecionado.
- Check-in por data e tipo de culto: quarta, sábado ou especial.
- Busca unificada por membros ativos e visitantes.
- Cadastro rápido de visitante durante o check-in.
- Bloqueio de presença duplicada da mesma pessoa no mesmo culto.
- Relatórios de ausências e visitantes recorrentes.
- Acompanhamento pastoral de membros com faltas seguidas, com WhatsApp, observações e status.

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Entre na pasta do app:

```bash
cd outputs/igreja-presenca
```

3. Instale as dependências:

```bash
npm install
```

4. Copie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

5. Preencha `.env.local` com os dados do Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL=lideranca@iasdcalcada.com.br
```

6. No Supabase, abra SQL Editor e execute os arquivos SQL nesta ordem:

1. `supabase/01_base.sql`
2. `supabase/02_functions_triggers.sql`
3. `supabase/03_security_policies.sql`
4. `supabase/07_member_followups.sql`
5. `supabase/08_delete_permissions.sql`
6. Opcional para teste: `supabase/04_seed_test_members.sql`

Cole cada arquivo inteiro no SQL Editor e execute. Não execute começando no meio do arquivo.

7. Execute `supabase/21_user_approval.sql` em projetos existentes. Depois disso, novos usuários solicitam acesso pela página de login e ficam bloqueados até a aprovação do administrador em `/usuarios`.

O administrador inicial é associado ao usuário com e-mail `sistema@iasdcalcada.com.br`. Para transferir a administração de uma instalação existente para essa conta, execute `supabase/22_transfer_admin.sql` depois que o e-mail estiver cadastrado e confirmado.

8. Execute `supabase/23_access_levels.sql` para aplicar a separação de permissões entre Administrador, Liderança e Recepção.

9. Execute `supabase/24_followup_actor_names.sql` para permitir que a liderança veja o nome e o sobrenome de quem realizou cada acompanhamento ou agradecimento.

10. Execute `supabase/25_followup_history.sql` para guardar o histórico imutável de contatos, tentativas e agradecimentos.

11. Execute `supabase/26_registry_archiving.sql` para ativar arquivamento, restauração e proteção contra exclusões acidentais.

12. Execute `supabase/27_registry_responsibility_history.sql` para registrar quem cadastrou, arquivou ou restaurou cada pessoa.

13. Execute `supabase/28_access_audit.sql` para registrar entradas e encerramentos de sessão.

14. Rode o app:

```bash
npm run dev
```

15. Abra `http://localhost:3000`.

## Publicar na Vercel

1. Envie esta pasta para um repositório GitHub.
2. Na Vercel, clique em Add New > Project e importe o repositório.
3. Configure as variáveis de ambiente:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL
```

4. Use as configurações padrão:

- Install command: `npm install`
- Build command: `npm run build`
- Output: padrão do Next.js

5. Depois do deploy, no Supabase vá em Authentication > URL Configuration.
6. Configure Site URL com a URL da Vercel.
7. Adicione a URL da Vercel em Redirect URLs.

## Banco de dados

O schema completo está em `supabase/schema.sql`. Para execução manual no painel do Supabase, prefira os arquivos separados:

- `supabase/01_base.sql`
- `supabase/02_functions_triggers.sql`
- `supabase/03_security_policies.sql`
- `supabase/04_seed_test_members.sql` para cadastrar 10 membros de teste
- `supabase/06_lideranca_full_access.sql` para atualizar projetos antigos e liberar liderança em todo o sistema
- `supabase/07_member_followups.sql` para criar o acompanhamento pastoral
- `supabase/08_delete_permissions.sql` para liberar remoção de visitantes e presenças marcadas por engano
- `supabase/15_visitor_denomination.sql` para adicionar a denominação ao cadastro de visitantes
- `supabase/16_pastor_speaker_role.sql` para permitir escolher entre Pastor e Pregador
- `supabase/17_member_qr_checkin.sql` para ativar o check-in de membros por QR Code
- `supabase/19_visitor_sensitive_data.sql` para restringir pedidos de oração e observações pastorais à liderança
- `supabase/20_export_audit_logs.sql` para registrar e controlar exportações de dados pessoais
- `supabase/21_user_approval.sql` para ativar cadastro público, aprovação e administrador inicial
- `supabase/22_transfer_admin.sql` para transferir a administração para o e-mail do sistema
- `supabase/23_access_levels.sql` para separar os acessos de Administrador, Liderança e Recepção
- `supabase/24_followup_actor_names.sql` para exibir o responsável por acompanhamentos e agradecimentos
- `supabase/25_followup_history.sql` para preservar o histórico de cada contato realizado pela liderança
- `supabase/26_registry_archiving.sql` para arquivar e restaurar cadastros sem apagar históricos
- `supabase/27_registry_responsibility_history.sql` para identificar os responsáveis por cadastros, arquivamentos e restaurações
- `supabase/28_access_audit.sql` para auditar entradas e encerramentos de sessão

Eles criam:

- `profiles`
- `members`
- `visitors`
- `services`
- `attendances`

Também cria os tipos, índices, gatilhos, políticas RLS e permissões necessárias.

## Observações

- O app usa Supabase RLS para separar permissões.
- A duplicidade de presença é bloqueada por duas constraints no banco.
- O check-in cria o culto automaticamente quando a primeira presença é marcada.
