# Auditoria — Bora Marcá

**Data:** 25/08/2026 · **Base:** 11 commits · **Referência:** CONTEXTO_MESTRE_BORA_MARCA.md

---

## Veredito

O projeto tem **um backend excelente e um produto errado**.

A fundação Supabase é de qualidade acima da média para o porte: 23 tabelas com RLS universal, FKs compostas `(id, tenant_id)` que tornam vazamento entre empresas estruturalmente impossível, escrita concentrada em RPCs transacionais com locks reais, anti-conflito de agenda delegado a uma *exclusion constraint* GiST. Nada disso é fachada.

Mas o que foi construído em cima é **um aplicativo de estética automotiva, não um SaaS multi-segmento**. O catálogo de segmentos existe, está bem escrito, e tem **zero importadores** — está numa raiz que o app nem consegue compilar. A Fase 2 (Barbearia) tem 0% e a Fase 1 foi declarada concluída sobre uma premissa factualmente falsa.

**Números:** 4.955 linhas de SQL · 3.214 linhas de frontend · 1 rota · 0 testes de frontend · 0 CI · 5 das 14 migrations são correções de migrations anteriores.

---

## 1. Placar por fase

| Fase | Status | Evidência |
| --- | --- | --- |
| **1 — Fundação** | ~60% | Schema, auth, multi-tenant, RLS e 5 papéis prontos. Análise do Barbershop **não feita**; SegmentConfig/flags/labels escritos mas **desconectados**; estrutura de módulos inexistente. |
| **2 — Barbearia** | **0%** | Nenhum código. Só o valor `'barbershop'` no enum e uma entrada no catálogo órfão. |
| **3 — Automotive base** | ~70% | Veículos, agenda, boxes e conflitos prontos. Falta preço por categoria, UI de boxes, catálogo de serviços. |
| **4 — Operação automotiva** | ~80% | OS, itens, pagamentos, fotos, eventos e Pátio funcionais. Checklist é jsonb livre; antes/depois não existe. |
| **5 — Experiência** | ~40% | Relatórios, histórico, fidelidade e conta prontos. Notificações 0%, área do cliente 0%, financeiro parcial. |
| **6 — Novos segmentos** | ~5% | Enum de 10 valores + catálogo TS órfão. |

### Os 24 itens da ordem recomendada

**7 FEITO · 13 PARCIAL · 4 NÃO FEITO**

| # | Item | Status |
| --- | --- | --- |
| 1 | BusinessType | PARCIAL — enum no banco; frontend nunca lê o campo |
| 2 | SegmentConfig | PARCIAL — completo em `src/config/segments.ts`, zero importadores |
| 3 | Feature Flags | PARCIAL — `hasFeature()` escrita, nunca chamada |
| 4 | Labels | PARCIAL — labels dos 10 segmentos definidas, nunca consumidas |
| 5 | Vehicle (modelo) | **FEITO** |
| 6 | Vehicle CRUD | PARCIAL — criação implícita na entrada rápida; sem editar/inativar |
| 7 | Serviços automotivos | PARCIAL — usa `public.services` genérico, sem tela de cadastro |
| 8 | Preço por categoria | **NÃO FEITO** |
| 9 | Agenda automotiva | **FEITO** |
| 10 | Boxes | PARCIAL — banco pronto, **nenhuma UI** |
| 11 | Validação de conflito | **FEITO** |
| 12 | WorkOrder | **FEITO** |
| 13 | WorkOrderItems | **FEITO** |
| 14 | Inspection / checklist | PARCIAL — jsonb livre, sem modelo de avarias |
| 15 | Fotos | **FEITO** |
| 16 | Before/After | **NÃO FEITO** |
| 17 | Timeline | PARCIAL — eventos no banco, UI nunca os consulta |
| 18 | Dashboard | PARCIAL — Pátio + relatórios (decisão explícita do DESIGN.md) |
| 19 | Histórico | **FEITO** |
| 20 | Área do cliente | **NÃO FEITO** |
| 21 | Notificações | **NÃO FEITO** |
| 22 | Financeiro | PARCIAL — só pagamento por OS; sem caixa |
| 23 | Testes | PARCIAL — 2 arquivos SQL sem runner; **RLS nunca exercitada** |
| 24 | Segurança | PARCIAL — modelagem forte, privilégios furados |

---

## 2. O que está pronto e bom

Vale registrar antes das críticas, porque é reaproveitável.

- **Isolamento de tenant por construção.** Toda relação entre tabelas usa FK composta `(id, tenant_id)`. Não é possível apontar um registro para outro tenant nem por bug de aplicação.
- **RLS em 100% das 23 tabelas.** Nenhuma tabela exposta pela API sem política. `automotive_patio` é view `security_invoker = true`, herdando a RLS de quem consulta.
- **`set search_path = ''` em 46/46 definições de função.** Nenhuma função vulnerável a *search_path hijacking*.
- **Concorrência tratada de verdade:** 12 `SELECT ... FOR UPDATE`, 4 `FOR KEY SHARE`, 2 advisory locks, 1 exclusion constraint GiST, 1 upsert-lock no contador de OS.
- **Totais impossíveis de dessincronizar:** `line_total` é coluna `GENERATED STORED`; o total da OS é agregação na view, não coluna denormalizada.
- **Separação conceitual correta** entre Agendamento, OS, Pagamento e Entrega — documentada em CONTEXT.md e implementada de fato.
- **Fotos privadas bem feitas:** bucket privado, MIME restrito, path canônico `{tenant}/{os}/{etapa}/{uuid}` validado por regex no Storage *e* no metadado, URL assinada de 30 min, rollback do upload se o registro falhar.
- **Frontend limpo:** `lint`, `tsc --noEmit` e `build` passam sem erro nem aviso. `strict: true` ativo.
- **Acessibilidade acima da média:** focus trap real com Escape e restauração de foco, `role="status"`/`"alert"` corretos, `aria-current`, `prefers-reduced-motion`, `lang="pt-BR"`.
- **Modo prévia honesto:** 14 avisos explícitos de "somente nesta prévia". A interface nunca finge gravar dados.
- **Resgate de fidelidade idempotente** por chave UUID + advisory lock + unique parcial.

---

## 3. Bugs e riscos críticos

Ordenados por urgência. Todos verificados no código.

### 🔴 C-1 · Os privilégios de função e tabela estão furados em quase todas as migrations

`revoke ... from public` **não remove** os grants que o Supabase concede a `anon` e `authenticated` via `ALTER DEFAULT PRIVILEGES`. O projeto sabe disso — `20260824001000_harden_automotive_media_function_grants.sql:1-3` documenta e corrige exatamente isso, mas **só para as 6 funções de mídia**. Verificado: de 64 revokes no repositório, apenas 24 mencionam `anon`.

Consequência: ~31 funções continuam com `EXECUTE` para `anon`/`authenticated`, incluindo funções que nunca deveriam ser expostas.

**Correção:** `revoke all on function ... from public, anon, authenticated;` em todas, e re-conceder só o pretendido. Conferir em produção com `\dp` / `pg_proc.proacl`.

### 🔴 C-2 · `next_automotive_work_order_number` é `SECURITY DEFINER`, escreve, e não valida nada

`20260824000500_automotive_operations.sql:377-394`. Zero verificação de papel, membership ou tipo de negócio. Combinada com C-1, é chamável via `POST /rest/v1/rpc/` para qualquer `tenant_id` válido, incrementando o contador indefinidamente: buracos permanentes na numeração de OS e caminho para estouro de `integer`. É a única RPC mutante do schema sem autorização. A intenção estava certa (foi omitida da lista de grants); o mecanismo é que não funciona.

### 🔴 C-3 · As 6 tabelas da fundação nunca tiveram privilégios revogados

`20260824000100_initial_foundation.sql` contém **apenas 4 revokes, todos de função** (linhas 317-320) — verificado. Logo `profiles`, `businesses`, `business_members`, `customers`, `professionals` e `services` mantêm `ALL` para `anon`/`authenticated`, **incluindo TRUNCATE**.

**TRUNCATE não é filtrado por RLS.** É destruição cross-tenant de todos os clientes, profissionais e serviços da plataforma inteira.

A migration `20260824000400_harden_schedule_table_grants.sql` existe exatamente com essa justificativa ("for example, TRUNCATE") mas só endureceu `appointments` e `professional_schedule_rules`. As 6 tabelas mais antigas ficaram para trás.

⚠️ Ao corrigir: as políticas de INSERT/UPDATE/DELETE dessas tabelas **dependem** hoje desses grants padrão. É preciso re-conceder o DML pretendido junto com o revoke.

### 🔴 C-4 · Nenhuma política de RLS jamais foi executada

Verificado: **nenhum `set role` nos dois arquivos de teste**. Eles rodam com o papel da conexão (superusuário), que ignora RLS. Todos os inserts diretos em `businesses`, `customers`, `professionals` etc. só funcionam por causa disso.

Os testes cobrem lógica transacional — e cobrem bem. Mas **a camada de segurança inteira está sem cobertura**, e não há um único teste com dois tenants. Somado a C-1/C-2/C-3, é a origem provável de os três terem passado despercebidos.

Também não há runner: o cabeçalho dos testes manda usar `supabase db query --linked`, subcomando que não existe no CLI fixado (v2.115.0). Na prática, os testes só rodam colando SQL manualmente.

### 🟠 C-5 · A reserva de box `[received_at, 'infinity')` inviabiliza agendar boxes

`20260824000500:518-536` — verificado. A exclusion constraint então rejeita **toda** reserva futura daquele box enquanto houver um veículo dentro dele. Simétrico e igualmente ruim nos dois sentidos:

- com um carro no box B, agendar B para amanhã falha;
- havendo agendamento futuro com B reservado, receber um carro hoje em B falha com `exclusion_violation` cru do Postgres, sem tratamento.

O segundo caso é a operação normal de qualquer empresa que agende com antecedência. Nenhum teste cobre isso.

### 🟠 C-6 · A OS nunca fecha o agendamento de origem

`open_automotive_work_order` vincula `appointment_id` mas nunca atualiza `appointments.status` — verificado: só as migrations 200/300/600 tocam essa tabela. O agendamento fica `scheduled`/`confirmed` para sempre, inclusive depois da OS entregue. A reserva do profissional continua viva. **Agenda e Pátio divergem permanentemente.**

### 🟠 C-7 · Reserva de box do agendamento sobrevive quando a OS abre sem box

`20260824000500:799-807` — a limpeza está **dentro** do `if p_box_id is not null`. Abrir a OS sem box (fluxo comum: carro chega, box ocupado) deixa a reserva órfã; quando o box liberar, atribuí-lo colide com ela. E quando `p_box_id` é informado, o `delete` remove a reserva de **qualquer** box do agendamento, mesmo outro.

### 🟠 C-8 · Nenhuma leitura é segregada por papel dentro do tenant

Todas as 23 políticas de SELECT usam `is_active_business_member(tenant_id)`. Um **técnico lê CPF, telefone, e-mail e aniversário de todos os clientes** (`20260824000100:386`), todo o histórico de pagamentos e o extrato de fidelidade. Sem consentimento, sem minimização, sem mascaramento. É o maior ponto de exposição LGPD do schema — e o contexto mestre trata LGPD como requisito de arquitetura, não opcional.

### 🟠 C-9 · Pagamento sem qualquer relação com o valor da OS

`record_automotive_work_order_payment` valida só `amount > 0`. Aceita R$ 1.000.000 numa OS de R$ 120 e estorno maior que o total pago, produzindo `paid_amount` negativo. O `payment_status` derivado então classifica como `'unpaid'` uma OS que teve dinheiro devolvido a mais.

### 🟡 Demais achados

| ID | Achado | Local |
| --- | --- | --- |
| C-10 | Mídia removida deixa arquivo **legível** no bucket: a policy de leitura não consulta `automotive_work_order_media` | `...000700:70-87` + `...000800` |
| C-11 | `DELETE` de profissional é sempre impossível (trigger cria recurso com FK RESTRICT) — a política promete o que o schema impede | `100:437` + `200:172` |
| C-12 | `DELETE` de empresa colide CASCADE contra RESTRICT: empresa com qualquer OS paga **não pode ser excluída** — bloqueia offboarding e apagamento LGPD | `100:362` |
| C-13 | Walk-in permite múltiplas OS abertas para o mesmo veículo — mesmo carro duas vezes no Pátio, dois faturamentos. O teste **afirma esse comportamento como correto** | `...001200` + teste:143-165 |
| C-14 | OS sem itens aparece como **`'paid'`** — toda OS walk-in nasce marcada como paga | `...000500:1406` |
| C-15 | Gaveta da OS abre sozinha em mobile no primeiro carregamento (`selectedId` já nasce preenchido) | `automotive-patio.tsx:69,471` |
| C-16 | "Nova entrada" quebra o layout nas telas Agenda/Veículos/Relatórios (grid de 2 colunas recebendo 3 filhos) | `globals.css:117,125,139` |
| C-17 | Relatórios baixam **todo o histórico do tenant** para o navegador, sem filtro de data, e calculam recorrência em O(n²) | `automotive-insights.tsx:58,90-121` |
| C-18 | Contraste abaixo de WCAG AA: `.lane-empty` ≈2.5:1, `.strip-label` ≈4.3:1 | `globals.css:93,74` |
| C-19 | `aria-modal="true"` em painel que não é modal acima de 980px — leitor de tela ignora conteúdo visível e utilizável | `quick-entry:327`, `work-order:453` |
| C-20 | Último owner pode se auto-remover e órfanar a empresa permanentemente | `100:382` |
| C-21 | `config.toml:71` aponta para `supabase/seed.sql` que **não existe** — verificado | `config.toml` |
| C-22 | Contador "Boxes em uso" tem denominador literal `/ 4` | `automotive-patio.tsx:383` |
| C-23 | Sino de notificações com bolinha vermelha permanente — indicador falso de estado | `automotive-patio.tsx:343` |

---

## 4. O desvio estrutural: multi-segmento não existe fora do banco

Este é o achado que muda a direção do projeto, não apenas a lista de tarefas.

### O catálogo é código morto por construção

`src/config/segments.ts` (224 linhas) está correto e completo: 10 segmentos, 11 feature flags, labels por segmento ("Barbeiro", "Técnico", "Nail Designer", "Tatuador", "Tutor"), `getSegmentConfig()` e `hasFeature()` com a regra certa — plano restringe, nunca habilita o que o segmento não suporta.

**Verificado: zero importadores em todo o repositório.** A única menção fora do próprio arquivo é `docs/foundation.md:12`, que *promete* o uso.

E não é esquecimento — é impossibilidade. `web/tsconfig.json` mapeia `"@/*": ["./src/*"]` resolvido a partir de `web/`, e o `include` não alcança a raiz. **`src/config/segments.ts` nunca é compilado, nunca é type-checked, nunca é lintado.** É o arquivo mais importante do projeto para o objetivo declarado e é o único que nenhuma ferramenta verifica.

### O frontend não sabe em que segmento está

Verificado: **zero ocorrências de `business_type` em `web/src`**. A coluna existe no banco (`100:51`), é `not null`, e o frontend simplesmente não a lê — `automotive-patio.tsx:161` seleciona apenas `name, timezone`.

Não há `if (businessType === "...")` espalhado pelo código — mas apenas porque o segmento **nunca é consultado**. O automotivo é assumido incondicionalmente:

| Local | Conteúdo hardcoded |
| --- | --- |
| `layout.tsx:5` | `"Bora Marcá — Pátio Automotive"` |
| `automotive-patio.tsx:337` | `"Estética Automotiva"` |
| `automotive-patio.tsx:499,503` | `<span>Técnico</span>`, `<span>Box</span>` |
| 7 pontos distintos | prefixo `"OS"` literal |
| `lib/scheduling.ts:38` | `kind: "professional" \| "service_box"` — box vaza para a lib que deveria ser comum |

Dos 10 segmentos do catálogo, **9 não têm nenhuma superfície**. Um usuário de barbearia que logar hoje vê um Pátio pedindo placa de veículo.

### A camada de permissões também não existe

`automotive-profile.tsx:41-48` tem uma matriz de permissões por papel — mas ela é **puramente informativa e duplicada**. Os gates reais são checagens de string ad-hoc espalhadas: `["owner","manager","receptionist"].includes(role)` na agenda, `role === "owner" || role === "manager"` nos insights. Três definições independentes do tipo `BusinessRole` convivem em três arquivos.

O contexto mestre pede `permissions.canViewFinance`. O que existe é exatamente o `if (user.role === "owner")` que o documento manda evitar.

### Fase 1 declarada concluída sobre premissa falsa

`docs/foundation.md:3` afirma: *"O repositório foi iniciado sem código-base e sem uma cópia do Barbershop."*

`D:\Claude\BarberShop` existe e é um projeto substancial (React Native + Firebase), com `AUDITORIA.md` de 37 KB, `RELATORIO_ANALISE.md` e `CLAUDE.md` — documentação já pronta exatamente para o mapeamento que a Fase 1 exigia.

O stack de origem de fato não é portável para Next.js/Supabase. Mas a Fase 1 pedia mapeamento de **domínio e comportamento**, não de código. Essa análise não existe, e a justificativa registrada é incorreta.

---

## 5. O que não existe (banco e UI)

### Ausente por completo

| Requisito do contexto mestre | Status |
| --- | --- |
| **Preço por categoria de veículo** (§24) | Zero. Só `services.base_price` único. `foundation.md:21` prometeu e a migration foi escrita sem — o doc nunca foi corrigido |
| **Caixa** (`cash_transactions`) | Nenhuma tabela. Sem abertura/fechamento/sangria |
| **Contas a pagar / a receber** | Nenhuma tabela |
| **Comissão** | Nenhuma coluna |
| **Parcelamento** | Sem `installments`/`due_date` |
| **Estoque / produtos** | `kind='product'` é texto livre sem catálogo. `segments.ts` declara `inventory: true` para todos os 10 segmentos; o banco não tem nada |
| **Planos e assinaturas do SaaS** | Zero. `hasFeature()` aceita `planFeatures` que nada popula |
| **Notificações** | Zero tabelas, zero eventos de saída, zero WhatsApp. Não existe `vehicle_ready` |
| **LGPD** | Sem consentimento, sem retenção, sem anonimização. Pior: FKs RESTRICT tornam o direito ao esquecimento **tecnicamente impossível** (C-12) |
| **Área do cliente** | `anon` não tem nenhuma política. Sem `customers.user_id`, sem token |
| **Seeds por segmento** | `seed.sql` não existe (C-21). Zero serviços automotivos sugeridos |
| **Onboarding / criação de empresa** | A UI nunca faz `insert` em `businesses`. `can_claim_initial_tenant_owner()` foi escrita para isso e **não tem consumidor** |
| **Gestão de membros / convites** | Reconhecido no DESIGN.md como decisão consciente, sem plano |
| **Antes/depois** | Estágios existem; comparação não |
| **CRUD de serviços, profissionais, boxes** | Nenhuma tela. Se `services` estiver vazia, a agenda trava sem oferecer saída |

### Existe no banco, sem UI

Seis funções prontas e nunca chamadas — verificado:

`open_automotive_work_order` · `create_automotive_box` · `assign_automotive_work_order_box` · `assign_automotive_appointment_box` · `release_automotive_work_order_box` · `can_claim_initial_tenant_owner`

A mais grave é a primeira: **abrir OS a partir de um agendamento não existe na interface**. Só a variante walk-in é usada. Na prática, **Agenda e Pátio são dois sistemas que não se conversam** — exatamente a ponte que os ADRs 0001 e 0002 descrevem como decisão central.

### Checklist existe como campo, mas nada o preenche

`automotive-insights.tsx` renderiza `checklistSummary(intake.checklist)`. Mas `open_automotive_walk_in_work_order` **não tem parâmetro de checklist**, e `deliver_automotive_work_order` é chamado só com `p_work_order_id`, deixando `p_checklist` no default `'{}'`. A tela exibe um campo que ela própria nunca consegue preencher.

E como estrutura, o checklist é `jsonb` livre: sem itens, sem enum `ok/damaged/attention`, sem template. **Impossível consultar ou relatar avarias** — que é o motivo de existir um checklist de entrada.

---

## 6. Estado da engenharia

| Item | Status |
| --- | --- |
| README de raiz | Não existe (só `web/README.md`, que cobre apenas o frontend) |
| `.gitignore` de raiz | Não existe |
| `package.json` de raiz | Não existe |
| CI / GitHub Actions | Não existe |
| Husky / lint-staged / Prettier | Não existem |
| Testes de frontend | **Zero** |
| Runner dos testes SQL | Não existe; a instrução no cabeçalho é inválida para o CLI fixado |
| Como aplicar migrations | **Não documentado em lugar nenhum** |
| Como criar o primeiro tenant/owner | **Não documentado — bloqueador absoluto** |

Um dev novo sobe a prévia demonstrativa em 2 minutos e **não consegue chegar ao modo conectado sem ler SQL**: sem inserir manualmente `businesses` + `business_members`, cai em "Conta sem unidade ativa" e a aplicação inteira trava.

**5 das 14 migrations são correções de migrations anteriores** (`fix_appointment_transition_event`, `complete_media_removal`, `fix_media_path_stability`, `lock_walk_in_entry`, `make_redemptions_idempotent`), todas encontradas manualmente. Sem CI, essa taxa não cai.

### Qualidade do código frontend

Build, lint e tsc limpos — mas a **densidade artificial** derrota revisão e `git blame`:

| Arquivo | Linhas | Bytes | Maior linha |
| --- | --- | --- | --- |
| `automotive-insights.tsx` | 150 | 35 KB | **5.642 chars** |
| `automotive-agenda.tsx` | 682 | 43 KB | **5.220 chars** |
| `automotive-profile.tsx` | 278 | 15 KB | **3.389 chars** |
| `globals.css` | 156 | 67 KB | **11.764 chars** |

Duas telas inteiras espremidas em três linhas de JSX. Um `return` único de 3.389 caracteres. O lint não pega porque não há `max-len`.

**Não há camada de serviço.** Cada componente monta suas próprias queries — `automotive-agenda.tsx:258` é um `Promise.all` de 8 queries dentro do `useEffect` de um componente de UI. `createClient()` é chamado 25 vezes. As regras de negócio da prévia (validação de conflito) vivem no componente e não são compartilhadas com o modo live: **duas implementações da mesma regra, e a do frontend não tem teste.**

---

## 7. Roteiro de correção sugerido

### Bloco 0 — Antes de qualquer produção (segurança)

1. **C-1 + C-3** — corrigir o modelo de privilégios em todas as migrations; re-conceder o DML que as políticas usam.
2. **C-2** — adicionar validação de papel em `next_automotive_work_order_number` ou torná-la inacessível.
3. **C-4** — reescrever os testes com `set role authenticated` e **dois tenants**; adicionar runner (`supabase test db` com pgTAP, ou script npm) e GitHub Actions.

Sem o item 3, os itens 1 e 2 podem regredir sem ninguém perceber.

### Bloco 1 — Operação automotiva que já foi vendida

4. **C-5 + C-7** — reserva de box com fim previsto em vez de `infinity`; mover a limpeza da reserva para fora do `if`.
5. **C-6** — fechar o agendamento quando a OS avança.
6. **Tela de boxes + abrir OS a partir de agendamento** — as 5 RPCs órfãs. É o que liga Agenda ao Pátio.
7. **C-9, C-13, C-14** — validar pagamento contra o total, impedir OS duplicada por veículo, corrigir `payment_status` de OS sem itens.

### Bloco 2 — A decisão de direção

8. **Mover `src/config/segments.ts` para dentro de `web/src/`** (ou criar workspace na raiz) e fazer o app resolver o segmento a partir de `businesses.business_type`.
9. **Criar a fronteira core/módulos no frontend enquanto custa 6 arquivos e não 60.**
10. **Substituir as ~15 strings hardcoded** ("Técnico", "Box", "OS", "Estética Automotiva") por consultas ao catálogo.
11. **Criar a camada `permissions.*`** e eliminar as três definições duplicadas de `BusinessRole`.

Nenhum destes exige escrever uma linha de barbearia — mas os quatro são pré-requisito para que barbearia custe **uma feature em vez de um fork**.

### Bloco 3 — Cadastros de base

12. CRUD de serviços, profissionais, clientes e veículos. Hoje o app só funciona sobre um banco populado por fora.
13. Onboarding: criação de empresa + primeiro owner, usando `can_claim_initial_tenant_owner()` que já existe.

### Bloco 4 — Decisões a registrar como ADR

Dez decisões foram tomadas e implementadas sem registro. As que mais confundem quem chega:

- inversão da ordem dos segmentos (automotivo antes de barbearia);
- não reaproveitar o Barbershop (sobre premissa incorreta);
- Supabase + RLS como autoridade de autorização — a decisão mais consequente do projeto, sem ADR;
- arquitetura 100% client-side, apesar de `@supabase/ssr` instalado;
- abandono do preço por categoria de veículo (`foundation.md:21` ainda promete);
- fixtures de demonstração dentro dos componentes de produção.

### O risco de médio prazo

O frontend é 100% cliente: 15 RPCs e 21 tabelas acessadas direto do navegador, sem server action, route handler ou middleware. Isso é **seguro hoje** — toda a autoridade está em RLS e RPC, e não há brecha.

Mas os itens que faltam nas Fases 5 e 6 são precisamente os que **não podem** morar no cliente: notificações (execução server-side + credenciais), área do cliente (token público sem `business_members`), planos (`planFeatures` no cliente é falsificável), financeiro completo (webhooks). Introduzir a camada de servidor depois significa reescrever aquisição de sessão, carregamento e tratamento de erro dos 6 componentes — que hoje chamam `getSession()` isoladamente, cada um por conta própria.

---

## Síntese

O desalinhamento com o contexto mestre **não é de esforço, é de direção.**

O projeto executou as Fases 3, 4 e boa parte da 5 do segmento automotivo com qualidade real; pulou a Fase 2 inteira; e deixou a parte da Fase 1 que sustenta o multi-segmento escrita mas **fisicamente desconectada** do aplicativo.

A fundação de dados é reaproveitável e boa. A aplicação, hoje, não é multi-segmento — e cada commit automotivo aumenta o preço de torná-la.
