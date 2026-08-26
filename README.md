# Bora Marcá

SaaS multiempresa e multi-segmento para negócios de serviços. O banco é a autoridade:
isolamento entre empresas por `tenant_id` + Row Level Security, e escrita concentrada em
funções transacionais.

| | |
| --- | --- |
| Banco | Supabase · PostgreSQL · RLS · Storage privado |
| Web | Next.js 16 · React 19 · Tailwind 4 |
| Testes | pgTAP via `supabase test db` |

---

## Requisitos

- **Docker** em execução (o Supabase local sobe em contêineres)
- **Supabase CLI** — <https://supabase.com/docs/guides/local-development/cli/getting-started>
- **Node 22+**

---

## Subir o projeto

```bash
# 1. Banco local: aplica as migrations, depois carrega seed.sql e o scaffolding de teste
npm run db:start

# 2. Ver as credenciais locais geradas
supabase status

# 3. Frontend
cd web
cp .env.example .env.local     # preencher com API URL e anon/publishable key do passo 2
npm ci
npm run dev
```

Sem `.env.local`, a interface sobe em **prévia demonstrativa**: dados fabricados, nenhuma
gravação. Com `.env.local` e uma conta, a aplicação leva você a `/comecar` para abrir a
empresa — e a prévia deixa de ser necessária.

---

## Criar a primeira empresa e o primeiro owner

> **Resolvido na Etapa 5.** Existe tela: entre com sua conta e a aplicação leva você a
> `/comecar`, onde você informa o nome e escolhe a categoria. A empresa, a posse e o
> catálogo sugerido nascem numa transação só.
>
> O caminho manual abaixo continua útil para semear ambiente de desenvolvimento.

Primeiro crie um usuário — pelo Studio local (`supabase status` mostra a URL), pelo painel
do projeto remoto, ou por `signUp` — e anote o UUID dele.

### Caminho do desenvolvedor (SQL, ignora RLS)

```sql
insert into public.businesses (name, business_type, created_by)
values ('Minha Estética', 'automotive_aesthetics', '<user-uuid>')
returning id;

insert into public.business_members (tenant_id, user_id, role)
values ('<tenant-id-retornado>', '<user-uuid>', 'owner');
```

`business_type` aceita onze valores: `barbershop`, `automotive_aesthetics`, `beauty_salon`,
`manicure`, `makeup`, `massage`, `tattoo`, `eyebrows`, `aesthetics`, `depilation`, `petshop`.
A interface se adapta a todos — o que muda por categoria são os recursos habilitados, os
rótulos e o catálogo inicial de serviços.

### Caminho da aplicação (autenticado, sob RLS)

As políticas já permitem que o próprio usuário faça o bootstrap, então isso funciona pela
API pública sem `service_role`:

1. `insert into businesses` com `created_by = auth.uid()` — permitido por
   `businesses_insert_creator_only`;
2. `insert into business_members` com o próprio `user_id` e papel `owner` — permitido por
   `can_claim_initial_tenant_owner`, que só aceita a reivindicação enquanto a empresa não
   tiver nenhum membro.

É exatamente este fluxo que a tela `/comecar` executa, pela RPC
`create_business_with_owner` — empresa, posse e catálogo numa transação só.

---

## Testes

```bash
npm run test:db     # suíte pgTAP
npm run verify      # test:db + lint + typecheck + build
```

Os testes vivem em `supabase/tests/` e rodam em ordem alfabética:

| Arquivo | Cobre |
| --- | --- |
| `00_privilege_snapshot.sql` | quem alcança o quê: lista fechada de RPCs, `anon` sem nada, sem privilégio destrutivo |
| `10_tenant_isolation.sql` | dois tenants; A não lê, escreve, altera nem apaga nada de B |
| `20_role_matrix.sql` | cada papel só faz o que lhe cabe, com o controle positivo ao lado |
| `30_scheduling.sql` | conflito de horário, disponibilidade, eventos de transição |
| `40_automotive_operations.sql` | ciclo completo: entrada, box, OS, mídia, itens, pagamento, entrega |
| `50_known_defects.sql` | regressão dos defeitos da auditoria: box, agendamento, pagamento, OS por veículo |
| `60_schedule_settings.sql` | almoço, antecedência, buffer e turno extra |
| `70_block_notes_and_ratings.sql` | motivo de bloqueio como dado privado, avaliação de atendimento |
| `80_recurrence_waitlist_links.sql` | recorrência, lista de espera, convite e vínculo do cliente |
| `90_business_onboarding.sql` | abertura de empresa e catálogo por categoria |
| `95_agenda_patio_bridge.sql` | atribuir técnico e box, editar box, disponibilidade por RPC |
| `97_new_categories.sql` | manicure, salão e maquiagem de ponta a ponta, sem vazamento automotivo |
| `98_core_finance.sql` | caixa, livro financeiro, comissão e espelhamento do pagamento da OS |
| `99_lgpd.sql` | dado pessoal segregado, consentimento por finalidade, anonimização, desligamento e encerramento da empresa |

### Sobre os `TODO`

Asserções marcadas com `todo_start`/`todo_end` descrevem o comportamento **correto** de algo
que ainda está errado: não quebram o CI, mas aparecem na saída, e o `pg_prove` avisa quando
uma passa. É assim que um plano de correção vira critério verificável.

**Hoje não há nenhum.** Os oito que existiam — C-1, C-2, C-3 nas Etapas 1 e C-5, C-6, C-9,
C-13, C-14 na Etapa 2 — viraram asserções obrigatórias quando as causas foram corrigidas.

### Por que pgTAP não está numa migration

O scaffolding fica em `supabase/tests/setup/`, carregado por `[db.seed] sql_paths`. Seeds
rodam em `db reset` e **nunca** em `db push`, então o esquema `tests` e as ~1000 funções do
pgTAP não chegam a um projeto publicado. Isso importa: a Etapa 1 adiciona um teste que
afirma exatamente quais funções são executáveis em produção.

O helper que torna tudo isso possível é `tests.act_as(uuid)`, que define
`request.jwt.claims` **e** troca o papel para `authenticated`. Sem a troca de papel, os
testes rodam como superusuário e nenhuma política é exercitada — que era exatamente o estado
anterior.

---

## Banco

```bash
npm run db:reset             # recria do zero: migrations + seeds
npm run db:push              # aplica as migrations no projeto vinculado
supabase link --project-ref <ref>
supabase migration new <nome>
```

Migrations em `supabase/migrations/`, aplicadas em ordem de nome. Nunca editar uma migration
já publicada — criar uma nova.

---

## Mapa do repositório

```
packages/core/   núcleo compartilhado entre site e app — sem React, sem RN, sem DOM
  segments/      catálogo de categorias, features e labels
  permissions/   papéis e autorização de interface
  domain/        tipos do domínio
  data/          consultas e RPCs (recebem um SupabaseClient)
  format/        datas, moeda, placa
supabase/
  migrations/    schema, RLS, funções transacionais
  tests/         suíte pgTAP
  tests/setup/   pgTAP + fixtures (somente local)
  seed.sql       ponto de entrada de seed local
web/             aplicação Next.js, consome @boramarca/core
docs/            contexto, especificações, ADRs, auditoria e plano
```

> O repositório é um **workspace npm**. `npm ci` na raiz instala tudo; os scripts
> `core:verify`, `web:lint`, `web:typecheck` e `web:build` rodam de lá.
>
> O núcleo é agnóstico de framework por construção: o `tsconfig` dele omite a lib `DOM` e
> `check-agnostic.mjs` recusa import de React, React Native ou Next. Ver
> [ADR 0005](docs/adr/0005-nucleo-compartilhado-entre-site-e-app.md).

---

## Documentação

| Documento | O que é |
| --- | --- |
| **[CONTEXTO_MESTRE_BORA_MARCA.md](CONTEXTO_MESTRE_BORA_MARCA.md)** | **a fonte funcional e arquitetural do produto — leia primeiro** |
| [CONTEXT.md](CONTEXT.md) | glossário: Agendamento, Entrada, OS, Pátio, Box, Entrega |
| [PRODUCT.md](PRODUCT.md) | produto, usuários, restrições |
| [DESIGN.md](DESIGN.md) | direção visual e componentes de operação |
| [docs/foundation.md](docs/foundation.md) | decisões da fundação |
| [docs/automotive-operating-spec.md](docs/automotive-operating-spec.md) | especificação da operação automotiva |
| [docs/adr/](docs/adr/) | decisões arquiteturais registradas |
| [docs/auditoria-2026-08-25.md](docs/auditoria-2026-08-25.md) | auditoria completa: 23 achados |
| [docs/plano-execucao.md](docs/plano-execucao.md) | plano de 14 etapas para corrigir e concluir |
| [docs/barbershop-extracao-dominio.md](docs/barbershop-extracao-dominio.md) | de onde vem o núcleo: as 49 telas do projeto anterior por categoria |
| [docs/como-prosseguir.md](docs/como-prosseguir.md) | síntese decisória e próximos passos |
| [.ai-team/](.ai-team/) | os dez agentes especializados do projeto |

Antes de mexer na arquitetura, ler o plano: a ordem das etapas é por dependência, não por
severidade, e algumas correções ficam bem mais caras se feitas fora de ordem.
