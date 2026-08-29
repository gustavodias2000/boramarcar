# Plano de correção e implantação — Bora Marcá

**Base:** auditoria de 25/08/2026 (`docs/auditoria-2026-08-25.md`) · 23 achados + 15 lacunas de escopo
**Premissa:** o objetivo multi-segmento do contexto mestre continua valendo.

---

## Como este plano está ordenado

A ordem **não** é por severidade. É por dependência, seguindo três regras:

**1. Nada se corrige sem uma rede que prove que ficou corrigido.**
Os três furos de privilégio (C-1, C-2, C-3) existem porque nenhuma política de RLS jamais rodou (C-4). Corrigi-los sem um harness de teste é repetir a condição que os criou. Por isso a Etapa 0 vem antes da Etapa 1 — e não o contrário, apesar de a Etapa 1 ser a mais grave.

**2. O que fica mais caro a cada commit vem antes do que fica igual.**
Reestruturar o frontend custa 6 arquivos hoje. Depois das telas de box, cadastros e onboarding, custa 20. Já as correções de SQL custam o mesmo daqui a seis meses. Por isso a reestruturação (Etapa 3) vem **antes** de qualquer tela nova, mesmo não entregando nada visível.

**3. O que desbloqueia vários itens vem antes do que desbloqueia um.**
A camada de servidor é pré-requisito de convites, notificações, área do cliente e planos — quatro etapas distintas. Ela entra cedo, junto da reestruturação, mesmo sem uso imediato.

**Uma inversão condicional:** se já existe uso real em produção, C-1/C-3 viram emergência com dados em risco. Nesse caso inverta 0 e 1 — aplique o hotfix de privilégios primeiro em janela controlada, e construa o harness logo em seguida. As Etapas 0 e 1 são as únicas cuja ordem depende disso.

---

## Visão geral

| # | Etapa | Entrega | Tam. | Destrava |
| --- | --- | --- | --- | --- |
| **0** | Rede de segurança | pgTAP, harness de RLS, CI | M | 1, e todo o resto |
| **1** | Fechar os privilégios | C-1, C-2, C-3, C-20 | M | produção |
| **2** | Bugs que corrompem a operação | C-5, C-6, C-7, C-9, C-10, C-13, C-14 | G | uso real |
| **3** | Reestruturar frontend + servidor | core/módulos, segmento, permissões, rotas | GG | 4→12 |
| **4** | Fechar Agenda ↔ Pátio | 6 RPCs órfãs, UI de box, C-22 | M | operação completa |
| **5** | Onboarding e cadastros | criar empresa, CRUDs, convites | G | fim do modo demo |
| **6** | Modelagem que falta | checklist, preço por categoria, antes/depois | G | Fase 4 real |
| **7** | LGPD e permissões granulares | C-8, C-11, C-12, consentimento, auditoria | G | requisito legal |
| **8** | Financeiro | caixa, contas, comissão, parcelamento | GG | — |
| **9** | Notificações | outbox, worker, provider WhatsApp | G | — |
| **10** | Área do cliente | acesso do consumidor final | G | — |
| **11** | Planos e assinaturas | plans, subscriptions, gate por plano | M | monetização |
| **12** | Barbearia | segundo segmento | M* | Fase 6 |
| **13** | Estoque e polimento | C-15…C-19, C-21, C-23 | M | — |

*Tamanhos assumem um desenvolvedor. P ≈ horas · M ≈ dias · G ≈ 1–2 semanas · GG ≈ 3+ semanas.
\* A Etapa 12 só é M **se** a Etapa 3 for feita direito. Sem ela, é GG.*

---

# BLOCO A — Estabilizar

Nada aqui entrega funcionalidade. Tudo aqui é pré-requisito de colocar o produto na mão de alguém.

## Etapa 0 — Rede de segurança

### 0.1 Migrar os testes para pgTAP

Os dois arquivos atuais têm boas asserções e um runner inválido. Reescrever como pgTAP preservando o que já cobrem (conflito de agenda, ciclo da OS, reaproveitamento por placa, preservação de reserva no reagendamento).

```
supabase/tests/
  helpers/fixtures.sql      -- cria 2 tenants, usuários e papéis
  helpers/auth.sql          -- troca de identidade
  00_grants.sql             -- snapshot de privilégios
  10_tenant_isolation.sql   -- matriz A×B
  20_roles.sql              -- matriz de papéis
  30_scheduling.sql         -- migrado do atual
  40_automotive_ops.sql     -- migrado do atual
```

### 0.2 O harness de identidade — a peça que faltava

É isto que torna a RLS testável. Sem esta função os testes continuam rodando como superusuário e não provam nada:

```sql
create or replace function tests.act_as(p_user_id uuid) returns void as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
end; $$ language plpgsql;

create or replace function tests.act_as_anon() returns void as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end; $$ language plpgsql;
```

`auth.uid()` lê `request.jwt.claims->>'sub'`. Com isso, `set local role` + claim fazem cada teste rodar sob a política real.

### 0.3 Matriz de isolamento entre tenants

Fixture com **dois** tenants completos. Para cada uma das 23 tabelas, o usuário do tenant A tenta as quatro operações sobre a linha do tenant B:

- `SELECT` → 0 linhas
- `INSERT` com `tenant_id` de B → erro de política
- `UPDATE` / `DELETE` → 0 linhas afetadas

E o mesmo conjunto como `anon` → tudo negado.

Hoje isso são zero testes. É o que deveria ter apanhado C-1 e C-3.

### 0.4 Snapshot de privilégios — o teste de maior alavancagem do plano

Converte uma classe inteira de bug invisível em falha de build:

```sql
-- nenhuma tabela de public concede nada a anon
select is_empty($$
  select table_name, privilege_type
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
$$, 'anon nao tem privilegio de tabela em public');

-- authenticated nunca tem TRUNCATE / REFERENCES / TRIGGER
select is_empty($$
  select table_name, privilege_type
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
$$, 'authenticated nao tem privilegio destrutivo');

-- lista fechada de funções executáveis por authenticated
select set_eq($$
  select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, $$ values ('create_staff_appointment'), ... $$,
  'apenas as RPCs previstas sao executaveis');
```

O terceiro é o mais importante: qualquer função nova nasce reprovada até ser conscientemente adicionada à lista.

### 0.5 Matriz de papéis

Casos que hoje ninguém verifica: técnico tentando entregar OS → negado · caixa tentando abrir OS → negado · recepcionista tentando salvar programa de fidelidade → negado · técnico não designado tentando registrar mídia → negado · transições inválidas de status → negado · path de mídia forjado apontando para OS de outro tenant → negado.

### 0.6 CI e ferramental de raiz

`package.json` na raiz, `.gitignore` na raiz, e workflow:

```yaml
- supabase db start
- supabase test db                              # pgTAP
- cd web && npm ci && npm run lint
- npx tsc --noEmit && npm run build
```

Adicionar `max-len` ao ESLint — é o que evita o retorno das linhas de 5.642 caracteres.

### 0.7 Documentar o que não está documentado

`README.md` de raiz com: aplicar migrations, rodar seeds, **criar o primeiro tenant e owner**, criar o bucket, rodar testes. O terceiro item é hoje um bloqueador absoluto para qualquer dev novo.

**Saída:** um `git push` que falha quando a segurança regride.

---

## Etapa 1 — Fechar os privilégios

Só começa depois que 0.4 existe e está **vermelho**. Ele fica verde ao fim desta etapa.

### 1.1 A armadilha, confirmada no código

As 6 tabelas da fundação (`profiles`, `businesses`, `business_members`, `customers`, `professionals`, `services`) **não têm um único `grant` explícito** em nenhuma migration. Elas funcionam hoje exclusivamente pelo default privilege do Supabase.

Portanto: **um `revoke` sem re-concessão derruba o aplicativo inteiro.** A migration precisa revogar e conceder no mesmo passo.

### 1.2 Matriz de grants (destino)

| Tabela | `authenticated` | `anon` |
| --- | --- | --- |
| `profiles` | SELECT, UPDATE | — |
| `businesses` | SELECT, INSERT, UPDATE, DELETE | — |
| `business_members` | SELECT, INSERT, UPDATE, DELETE | — |
| `customers` | SELECT, INSERT, UPDATE, DELETE | — |
| `professionals` | SELECT, INSERT, UPDATE, DELETE | — |
| `services` | SELECT, INSERT, UPDATE, DELETE | — |
| `appointments` | SELECT | — |
| `professional_schedule_rules` | SELECT, INSERT, DELETE † | — |
| `scheduling_resources`, `..._reservations`, `appointment_events` | SELECT | — |
| `automotive_vehicles` | SELECT, INSERT, UPDATE, DELETE | — |
| `automotive_boxes` | SELECT | — |
| OS e todas as filhas | SELECT | — |
| `automotive_work_order_media` | SELECT, INSERT, DELETE | — |
| `automotive_work_order_number_counters` | — ‡ | — |
| loyalty (2 tabelas) | SELECT | — |
| `automotive_patio` (view) | SELECT | — |

† Escrita direta que o frontend faz hoje. Migrar para RPC na Etapa 4 e reduzir para SELECT.
‡ Já correto — manter sem grant e sem política.

### 1.3 A migration

```sql
-- 1. tabelas: revogar o default e reconceder o pretendido
revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.businesses to authenticated;
-- … matriz acima, tabela por tabela, explicitamente

-- 2. funções: o revoke que a 001000 já provou ser o correto
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_active_business_member(uuid) to authenticated;
-- … as 21 RPCs e helpers previstos, com assinatura completa

-- 3. impedir recorrência
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

Escrever **explícito**, não em laço: a lista precisa ser revisável em code review, e é exatamente ela que o teste 0.4 espelha.

### 1.4 C-2 — `next_automotive_work_order_number`

Ela só é chamada de dentro de `open_automotive_work_order`, que também é `SECURITY DEFINER` e roda como owner. Então o correto **não** é adicionar checagem de papel — é não conceder execute a ninguém. O passo 2 acima já resolve, desde que ela fique fora da lista de grants. O teste 0.4 passa a garantir isso para sempre.

### 1.5 C-20 — último owner

`business_members_delete_owner_only` e o update de papel precisam recusar a operação quando ela deixaria o tenant sem nenhum owner ativo. Constraint via trigger, com teste na matriz 0.5.

**Saída:** 0.4 verde. Superfície de API fechada e verificada a cada push.

---

## Etapa 2 — Bugs que corrompem a operação

### 2.1 C-5 + C-7 — redesenhar a ocupação de box

O bug real: `[received_at, 'infinity')` faz a exclusion constraint rejeitar toda reserva futura daquele box. Não é um ajuste de valor — é um modelo errado. Ocupação física não tem fim conhecido, mas **precisa ter fim previsto** para conviver com agendamento.

**Modelo novo:**

1. Ao atribuir box a uma OS, reservar `[received_at, received_at + duração_prevista)`.
2. `duração_prevista` = soma da duração dos itens da OS, com piso num padrão por tenant (ex.: 2h) quando a OS ainda não tem item.
3. `add_automotive_work_order_item` **estende** a reserva. Se a extensão colidir, não falhar em silêncio: retornar conflito estruturado.
4. `release_...` e `deliver_...` **truncam** a reserva para `now()`, liberando o box de fato.
5. Se a OS ultrapassar a previsão, um job (ou o próprio próximo `transition`) estende em blocos, sinalizando atraso na UI.

**Erro estruturado:** `assign_automotive_work_order_box` hoje deixa vazar `exclusion_violation` cru. Capturar e retornar qual agendamento colide e quando — a recepção precisa dessa informação para decidir, não de um código do Postgres.

**C-7, no mesmo trabalho:** mover a limpeza da reserva do agendamento para **fora** do `if p_box_id is not null`, e escopar o `delete` ao box específico em vez de qualquer box do agendamento.

Testes: carro no box + agendamento futuro no mesmo box (os dois sentidos); OS aberta sem box seguida de atribuição; entrega libera o box para o próximo horário.

### 2.2 C-6 — fechar o agendamento de origem

`open_automotive_work_order` passa o agendamento para `in_progress`; a conclusão da OS passa para `completed`, o que já libera a reserva do profissional. Cancelar a OS devolve o agendamento a um estado coerente.

Teste: agendamento → OS → entrega ⇒ agendamento em `completed` e reserva do profissional liberada.

### 2.3 C-9 — pagamento coerente com o valor

Dentro de `record_automotive_work_order_payment`, com o `FOR UPDATE` que já existe: recalcular itens e pagamentos e recusar pagamento que faça o líquido exceder o total, ou estorno que o faça ficar negativo.

Decisão a tomar: se a empresa quiser aceitar valor a maior (gorjeta, acerto), isso precisa ser um `kind` próprio e não um pagamento que estoura o total.

### 2.4 C-14 — OS sem itens não é OS paga

`when coalesce(total,0) <= 0 then 'paid'` faz toda OS walk-in nascer marcada como paga — exatamente quando a equipe mais precisa ver "a cobrar". Separar em um estado próprio (`sem_itens` / `pending`).

### 2.5 C-13 — uma OS ativa por veículo

Recusar abertura quando o veículo já tem OS em estágio não-terminal, nas duas funções de abertura. **E corrigir o teste que hoje afirma o comportamento errado como correto** — é o exemplo mais claro de teste que documenta um bug.

### 2.6 C-10 — mídia órfã continua legível

`can_read_automotive_work_order_media_object` valida só o formato do path e a existência da OS; não consulta `automotive_work_order_media`. Resultado: foto removida some da tela e continua acessível por URL assinada.

Correção: a policy de leitura passa a exigir linha correspondente em `automotive_work_order_media`. Assim o metadado vira a autoridade, e o arquivo órfão fica inerte mesmo sem ser apagado. Somar a isso uma limpeza periódica e recriar a policy de UPDATE em `storage.objects`, ausente desde a migration 700 — é ela que quebra upload com `upsert`.

**Saída:** a operação automotiva para de produzir estado inconsistente.

---

# BLOCO B — Virar plataforma

## Etapa 3 — Reestruturar o frontend e introduzir a camada de servidor

A etapa mais cara e a única que fica mais cara a cada dia. Não entrega feature. Entrega a possibilidade de todas as outras.

### 3.1 Resolver a raiz dupla

`src/config/segments.ts` está fora do `include` e do alias do `web/tsconfig.json` — nunca é compilado.

> **Revisado em 25/08/2026.** A recomendação original era mover para `web/src/config/`, porque só existia um alvo. Confirmou-se que **haverá aplicativo, e também para a equipe** — técnico no pátio fotografando pelo celular, profissional consultando a própria agenda. Isso torna o núcleo compartilhado, não específico da web.

**Decisão vigente:** criar um **workspace npm** com `packages/core` agnóstico de framework. Mover para `web/src/` agora significaria mover duas vezes. Ver [ADR 0005](adr/0005-nucleo-compartilhado-entre-site-e-app.md).

### 3.2 A estrutura

```
packages/core/          compartilhado — zero React, zero React Native
  segments/             catálogo, features, labels
  permissions/          can(), papéis, um único BusinessRole
  domain/               tipos do domínio
  data/                 consultas e RPCs — recebe um SupabaseClient, não cria
  format/               datas, moeda, placa

web/src/
  core/auth/            sessão e clientes (navegador e servidor) — específico da web
  core/tenant/          resolução de tenant a partir de business_type
  modules/automotive/   patio, work-order, quick-entry, vehicles, boxes
  shared/               componentes, hooks
  app/                  rotas

app/                    React Native (futuro), consome packages/core
```

A fronteira passa a ter **dois níveis**: pacote (compartilhado × plataforma) e pasta (núcleo × módulo) dentro de cada um. Duas regras de lint: `packages/core` não importa React, React Native nem DOM; `core/` e `shared/` não importam de `modules/`.

### 3.3 Ligar o segmento

1. Ler `business_type` no bootstrap do tenant — hoje o `select` traz só `name, timezone`.
2. `SegmentProvider` expondo `hasFeature()` e `labels`.
3. Trocar as ~15 strings fixas ("Técnico", "Box", "OS", "Estética Automotiva", o `<title>`) por labels.
4. Navegação derivada de `hasFeature`, não da lista fixa de 6 itens.
5. Tirar `service_box` de `lib/scheduling.ts` — conceito de módulo vazando para a lib comum.

### 3.4 Permissões de verdade

Um `BusinessRole` (hoje são três definições em três arquivos). Um módulo `permissions` derivando `can()` a partir do papel. A matriz de `automotive-profile.tsx` deixa de ser JSX informativo e passa a ser **a fonte** que a tela renderiza.

Some as checagens ad-hoc: `["owner","manager","receptionist"].includes(role)` e `role === "owner" || role === "manager"` desaparecem.

### 3.5 Camada de servidor — scaffolding agora, uso depois

Introduzir junto porque depois custa reescrever a aquisição de sessão dos 6 componentes:

- `createServerClient` + `middleware.ts` para sessão e proteção de rota;
- um Route Handler de exemplo com o padrão de erro;
- `onAuthStateChange` no lugar do `window.location.reload()`;
- `createClient()` uma vez, não 25.

Sem isso, convites, notificações, área do cliente e planos ficam todos bloqueados.

### 3.6 Rotas reais

Substituir a navegação por `useState` por rotas: `/patio`, `/agenda`, `/veiculos`, `/relatorios`, `/conta`. Resolve deep link, botão voltar e a gaveta que abre sozinha no mobile (C-15).

### 3.7 Extrair dados da UI

Cada componente hoje monta suas queries — a agenda tem um `Promise.all` de 8 queries dentro de um `useEffect`. Mover para módulos de dados por domínio. É pré-requisito de C-17 (relatórios que baixam o histórico inteiro sem filtro de data).

### 3.8 Isolar as fixtures de demonstração

~260 linhas de dados fabricados dentro de componentes de produção, com dois caminhos de execução no mesmo arquivo. Mover para `demo/`, carregado só quando não há configuração.

**O modo demo é sintoma da falta de onboarding.** Quando a Etapa 5 entregar criação de empresa, ele deixa de ser necessário — e deve ser removido, não mantido.

### 3.9 Reformatar

Aproveitar que todos os arquivos serão tocados para desfazer a densidade artificial (linhas de 5.642 caracteres, CSS de 67 KB em 156 linhas). Com `max-len` no lint desde a Etapa 0, não volta.

**Saída:** o app sabe em que segmento está, tem fronteira core/módulo, permissões centralizadas e um lugar para código de servidor.

---

# BLOCO C — Completar o Automotive

## Etapa 4 — Fechar Agenda ↔ Pátio

Seis funções prontas no banco, nenhuma com consumidor. É a ponte que os ADRs 0001 e 0002 descrevem como decisão central e que a interface nunca construiu.

- **Tela de boxes** — `create_automotive_box`, listar, editar, desativar. (Falta RPC de edição/desativação: escrever.)
- **Abrir OS a partir do agendamento** — `open_automotive_work_order`. Hoje só o walk-in existe; é o buraco mais visível do produto.
- **Atribuir e liberar box na OS** — `assign_automotive_work_order_box`, `release_...`, `assign_automotive_appointment_box`.
- **Atribuir técnico à OS** — a RPC **não existe**. Hoje o campo só é preenchido na abertura vindo do agendamento, então **OS walk-in nunca tem técnico** — e como mídia e transição por técnico dependem desse campo, o técnico de um walk-in não consegue fotografar nem mover a própria OS. Escrever a RPC.
- **C-22** — denominador de "Boxes em uso" vem de `automotive_boxes`, não do literal `/ 4`.
- Migrar a escrita direta em `professional_schedule_rules` para RPC e reduzir o grant a SELECT.

## Etapa 5 — Onboarding e cadastros

O que hoje obriga a popular o banco por fora.

**Onboarding** — cadastro, criação de empresa **com escolha de segmento** (é aqui que `BusinessType` finalmente é usado de ponta a ponta), e `can_claim_initial_tenant_owner()` ganha seu primeiro consumidor.

**Convite de membros** — precisa de service_role, logo **precisa da Etapa 3.5**. Fluxo: convite por e-mail → Route Handler cria o usuário → `business_members` com papel. Sem essa etapa, "gestão de membros" continua sendo uma tela que só conta pessoas.

**CRUDs**: serviços (hoje, se a tabela estiver vazia, a agenda trava sem oferecer saída), profissionais, clientes, veículos.

**Seeds por segmento** — `supabase/seed.sql` não existe, embora o `config.toml` aponte para ele (C-21). Criar com os 19 serviços automotivos do contexto mestre e o equivalente para barbearia.

**Remover o modo demo.**

## Etapa 6 — Modelagem que falta

**Checklist estruturado.** Hoje é `jsonb` livre: sem itens, sem estados, sem template — impossível consultar ou relatar avarias, que é a razão de existir um checklist. Modelo: `inspection_templates` + `inspection_template_items` por tenant, `work_order_inspections` + `inspection_items` com enum `ok/damaged/attention`, observação e foto por item. Migrar o jsonb existente.

E fechar o buraco: a RPC de entrada rápida **não tem parâmetro de checklist**, e a de entrega é chamada só com o id da OS. A tela exibe hoje um campo que ela própria nunca consegue preencher.

**Preço por categoria de veículo.** Prometido em `foundation.md:21`, nunca implementado. `vehicle_category` (hatch, sedan, SUV, pickup, moto, van, utilitário, outros) em `automotive_vehicles`, tabela `service_prices (tenant_id, service_id, category, price)` com fallback para `base_price`. `add_automotive_work_order_item` escolhe pela categoria do veículo da OS.

**Antes/depois.** Os estágios existem; o pareamento não. Adicionar posição (frontal, traseira, lateral, interior, roda) na mídia, para que a foto de entrada e a de entrega do mesmo ângulo se emparelhem. UI de comparação.

---

# BLOCO D — Requisitos de arquitetura

## Etapa 7 — LGPD e permissões granulares

O contexto mestre trata isto como requisito de arquitetura, não como funcionalidade opcional. Hoje não existe nada.

**C-8 — segregar leitura por papel.** Todas as 23 políticas de SELECT usam `is_active_business_member`. Um técnico lê CPF, telefone, e-mail e aniversário de todos os clientes. RLS é row-level e não resolve isso sozinha: usar privilégio de coluna sobre os campos sensíveis mais uma view sem PII para o caminho do técnico.

**C-12 → anonimização, não exclusão.** As FKs RESTRICT impedem apagar cliente com histórico, e retenção contábil impede apagar mesmo. A resposta correta em LGPD é `anonymize_customer()`: zera PII, preserva a OS para efeitos fiscais, registra a operação. Isso resolve C-12 sem afrouxar integridade referencial.

**C-11 — desligar profissional.** A política promete DELETE que o trigger de recurso torna impossível. Substituir por RPC de desligamento usando `active`.

**Ainda:** consentimento, política de retenção, e trilha de auditoria genérica — hoje os eventos cobrem OS e agendamento, mas não alteração de cliente, veículo, preço, papel de membro ou programa de fidelidade.

---

# BLOCO E — Expandir

## Etapa 8 — Financeiro

Núcleo comum, não automotivo. Caixa (abertura, fechamento, sangria, conferência por meio de pagamento), contas a receber e a pagar, comissão por profissional, parcelamento. Relatórios sobre isso, com filtro de período — resolvendo C-17, que hoje baixa todo o histórico do tenant para o navegador e calcula recorrência em O(n²).

## Etapa 9 — Notificações

Depende da Etapa 3.5. Tabela de outbox + Edge Function worker + abstração de provider, com Evolution API primeiro e WuzAPI como alternativa, conforme o contexto mestre. Eventos: `appointment_created`, `vehicle_received`, `service_completed`, `vehicle_ready`, `appointment_cancelled`. Módulos publicam evento; a camada de comunicação escolhe o canal. E o sino da UI para de mostrar bolinha vermelha permanente (C-23).

## Etapa 10 — Área do cliente

Hoje `anon` não tem nenhuma política. Precisa de um caminho de acesso próprio (vínculo `customers.user_id` ou token de link mágico) e de políticas RLS separadas — sem afrouxar nada do lado da equipe. Escopo inicial de leitura: meus veículos, meus agendamentos, andamento, histórico, antes/depois.

## Etapa 11 — Planos e assinaturas

`hasFeature()` já aceita `planFeatures` e nada popula. `plans`, `plan_features`, `subscriptions`. **A resolução precisa ser server-side** — no cliente é falsificável. Regra que já está certa no catálogo: plano restringe, nunca habilita o que o segmento não suporta.

## Etapa 12 — Barbearia

O teste real da arquitetura. Se a Etapa 3 foi bem feita: config do segmento, seeds, e as poucas telas específicas. Se sair caro, a Etapa 3 não terminou — e é melhor descobrir aqui do que no sétimo segmento.

**Antes:** fazer o mapeamento de domínio do Barbershop que a Fase 1 pedia e nunca aconteceu. `AUDITORIA.md` e `RELATORIO_ANALISE.md` já existem lá. E corrigir `docs/foundation.md:3`, que afirma que o projeto não existia.

Também falta ao core, para qualquer segmento: vínculo serviço ↔ profissional e horário de funcionamento **da empresa** (hoje só há regra por profissional).

## Etapa 13 — Estoque e polimento

Estoque de materiais. E os achados restantes: C-15 (gaveta no mobile, já resolvida em 3.6), C-16 (layout quebrado pelo painel de entrada nas telas de 2 colunas), C-18 (contraste abaixo de WCAG AA), C-19 (`aria-modal` em painel que não é modal).

---

## Rastreamento — os 23 achados

| Achado | Etapa | Achado | Etapa |
| --- | --- | --- | --- |
| C-1 privilégios furados | 1 | C-13 OS duplicada por veículo | 2.5 |
| C-2 RPC sem autorização | 1.4 | C-14 OS sem itens = paga | 2.4 |
| C-3 tabelas sem revoke | 1 | C-15 gaveta no mobile | 3.6 |
| C-4 RLS nunca testada | 0 | C-16 layout do painel de entrada | 13 |
| C-5 box `infinity` | 2.1 | C-17 relatórios sem filtro | 3.7 + 8 |
| C-6 agendamento não fecha | 2.2 | C-18 contraste WCAG | 13 |
| C-7 reserva órfã | 2.1 | C-19 `aria-modal` | 13 |
| C-8 leitura sem papel | 7 | C-20 último owner | 1.5 |
| C-9 pagamento sem teto | 2.3 | C-21 `seed.sql` ausente | 5 |
| C-10 mídia órfã legível | 2.6 | C-22 denominador `/ 4` | 4 |
| C-11 delete de profissional | 7 | C-23 sino falso | 9 |
| C-12 delete de empresa | 7 | | |

Nenhum achado ficou fora.

---

## Decisões que precisam ser tomadas

Cada uma muda o trabalho de uma etapa. Nenhuma bloqueia começar.

1. **Existe uso em produção hoje?** Se sim, inverter Etapas 0 e 1 e tratar C-1/C-3 como hotfix.
2. **Duração prevista da OS** (2.1) — soma dos itens ou padrão por tenant? Recomendo soma com piso configurável.
3. **Pagamento acima do total** (2.3) — proibir ou criar um `kind` de acerto?
4. **Workspace** (3.1) — mover para `web/src` agora, promover a `packages/` quando existir segundo alvo. Recomendado.
5. **Convite de membros** (5) — e-mail com service_role, ou vincular usuário já existente? O primeiro é o certo e depende da Etapa 3.5.
6. **Exclusão de cliente** (7) — anonimização é a resposta correta; confirmar que atende ao entendimento jurídico de vocês.

---

## O que o contexto mestre deveria registrar

Dez decisões foram tomadas e implementadas sem ADR. Vale escrever, junto com este plano:

- inversão da ordem dos segmentos (automotivo antes de barbearia) — hoje ninguém distingue mudança de estratégia de esquecimento;
- Supabase e RLS como autoridade de autorização — a decisão mais consequente do projeto, e a única sem registro;
- arquitetura client-side e o momento de introduzir servidor (Etapa 3.5);
- preço por categoria: `foundation.md:21` ainda promete algo que a Etapa 6 só agora vai entregar;
- corrigir `foundation.md:3`, que declara inexistente um projeto que existe.

---

## O caminho crítico

```
0 ──► 1 ──► 2                    (SQL: estabilizar)
      │
      └──► 3 ──► 4 ──► 5 ──► 6   (frontend: plataforma e Automotive)
                 │
                 └──► 7          (LGPD)
                      │
                      └──► 8, 9, 10, 11 ──► 12 ──► 13
```

Etapas 0→2 e a 3 tocam camadas diferentes e **podem ser paralelizadas** se houver duas pessoas. Com uma só, a ordem acima é a que minimiza retrabalho.

O ponto de não-retorno é a **Etapa 3**. Enquanto ela não acontecer, cada tela nova aumenta o preço do multi-segmento — e chega um momento em que o caminho mais barato passa a ser abandonar a promessa e aceitar que o Bora Marcá é um produto automotivo com um enum de dez valores que nunca terá os outros nove.
