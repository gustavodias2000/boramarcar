# Extração de domínio — Barbershop → Bora Marcá

**Data:** 25/08/2026 · **Fonte:** `D:\Claude\BarberShop` (30.111 linhas, 119 arquivos)

Este é o entregável que a Fase 1 do contexto mestre exigia — *"analisar Barbershop, mapear o
que será reaproveitado"* — e que nunca aconteceu. `docs/foundation.md:3` afirma que o projeto
não existia; **essa afirmação é falsa e deve ser corrigida.**

---

## 1. O que o Barbershop é, de fato

| | |
| --- | --- |
| Runtime | React Native 0.80 · React 19 · TypeScript strict |
| Backend | Firebase — Auth, Firestore, Functions, Cloud Messaging |
| Tamanho | 119 arquivos · 30.111 linhas · 49 telas · 13 services · 14 repositories |
| Segurança | `firestore.rules` com **49.959 bytes** |
| Testes | **420 testes** Jest + E2E Detox + CI completo |
| Autoavaliação | Engenharia **8,7/10** · Visual **5,2/10** |

Não é protótipo. É um produto maduro, com dois perfis no mesmo binário (profissional e
cliente), auditado, testado e com LGPD real implementada.

---

## 2. O reuso, honestamente

**Código: ~0% porta.** React Native não roda em Next.js. Firestore não vira SQL. As regras do
Firestore são predicados sobre caminhos de documento; RLS são predicados sobre linhas. São
paradigmas diferentes, não sintaxes diferentes.

**Domínio: 80% ou mais.** E é a parte cara.

As 30 mil linhas não são o ativo. O ativo são as **decisões** dentro delas:

| Artefato | O que carrega |
| --- | --- |
| 49 telas | o inventário de funcionalidades de um SaaS de serviços completo |
| `src/types.ts` (611 linhas) | o modelo de domínio inteiro, comentado com o *porquê* de cada campo |
| 14 repositories | padrões de acesso e regras de negócio |
| 50 KB de regras | anos de "quem pode fazer o quê" |
| `AUDITORIA.md` | 9 etapas de problemas encontrados e corrigidos |

Redescobrir isso custa muito mais do que reescrever o código.

> **`src/types.ts` é o arquivo mais valioso do Barbershop para nós.** Cada campo tem comentário
> explicando a decisão — inclusive as decisões de privacidade. Vale ler inteiro antes de
> qualquer modelagem nova no Bora Marcá.

---

## 3. Modelo de domínio e o que falta no Bora Marcá

### 3.1 Coleções do Firestore

```
usuarios/{uid}                       perfil + consentimentos LGPD
  └ vinculos/{tipo_alvoId}           cliente ↔ empresa (id determinístico)
  └ tokens/{tokenId}                 push
convites/{codigo}                    código de convite
barbeiros/{barbeiroId}               TENANT legado + vitrine pública
  └ clientes/{clienteId}             agenda de contatos
  └ bloqueiosPrivados/{id}           MOTIVO do bloqueio (privado)
  └ configuracoes/{configId}
  └ banidos/{clienteUid}
negocios/{negocioId}                 TENANT novo
  └ membros/{membroId}               papel + comissão
  └ configuracoes/{configId}
agendamentos/{id}                    317 linhas de regras
  └ notificacoes/{envioId}           idempotência de envio
ocupacoes/{slotId}                   disponibilidade SEM dado pessoal
avaliacoes/{id} · despesas/{id} · listaEspera/{id} · recorrencias/{id}
```

> **Achado:** existem **dois modelos de tenant convivendo** — `barbeiros/{id}` (legado, o
> profissional autônomo *é* o tenant) e `negocios/{id}` + `membros` (novo, empresa com equipe).
> Os repositories consultam pelos dois escopos. É uma migração inacabada. O Bora Marcá já nasceu
> com o modelo certo (`businesses` + `business_members`) — **não repetir esse erro.**

### 3.2 Comparação entidade a entidade

| Conceito Barbershop | Bora Marcá | Situação |
| --- | --- | --- |
| `Negocio` + `MembroEquipe` | `businesses` + `business_members` | ✅ equivalente, e o nosso é melhor |
| `PapelEquipe` = dono \| profissional | 5 papéis | ✅ **nosso é mais rico** |
| `Usuario` | `profiles` + `auth.users` | ✅ equivalente |
| `ClienteContato` | `customers` | ⚠️ falta `origem` (manual/contatos) |
| `ServicoBarbeiro` | `services` | ⚠️ preço em **centavos inteiros** lá, `numeric(12,2)` aqui |
| `Agendamento` | `appointments` | ⚠️ ver 3.3 |
| `ocupacoes` | `scheduling_resource_reservations` + GiST | ✅ **nosso é estruturalmente melhor** |
| `ConfiguracaoAgenda` | `professional_schedule_rules` | 🔴 **ver 3.4 — maior lacuna** |
| `BloqueioHorario` + `BloqueioMotivo` | reserva `kind='block'` | 🔴 falta a separação de privacidade |
| `MembroEquipe.comissao*` | — | 🔴 **não existe** |
| `Despesa` | — | 🔴 **não existe** |
| `Avaliacao` | — | 🔴 **não existe** |
| `EntradaListaEspera` | — | 🔴 **não existe, nem no plano** |
| `Recorrencia` | — | 🔴 **não existe, nem no plano** |
| `VinculoCliente` | — | 🔴 **não existe** — é a base da área do cliente |
| `convites/{codigo}` | — | 🔴 **não existe** — é a base do convite de membros |
| `ConfiguracaoNotificacoes` | — | 🔴 **não existe** |
| `ConfiguracaoRelatorioEmail` | — | 🔴 **não existe** |
| `TemplatesMensagem` | — | 🔴 **não existe** |
| `BannerPromocional` | — | 🔴 **não existe** |
| `ClienteBanido` | — | 🔴 **não existe** |
| `consentimentoLGPD` + push | — | 🔴 **não existe** |
| `agendamentos/{id}/notificacoes` | — | 🔴 **não existe** — idempotência de envio |

### 3.3 Status do agendamento — divergência real

```
Barbershop:  pendente → confirmado → concluido → avaliado
                              ↘ cancelado
Bora Marcá:  scheduled → confirmed → in_progress → completed
                              ↘ cancelled
```

Barbershop tem **`avaliado`** (estado pós-conclusão que fecha o ciclo de avaliação) e não tem
`in_progress`. O Bora Marcá tem `in_progress` — que faz sentido para automotiva, onde o serviço
dura horas — e não tem avaliação.

**Recomendação:** manter os 5 estados atuais e tratar avaliação como entidade própria
(`appointment_ratings`), não como status. Um status que existe só para marcar "já avaliou"
mistura duas dimensões.

### 3.4 A maior lacuna: configuração de agenda

`ConfiguracaoAgenda` do Barbershop tem **9 campos**. O `professional_schedule_rules` do
Bora Marcá tem **3** (weekday, starts_at, ends_at).

| Campo | Bora Marcá tem? |
| --- | --- |
| `horaInicio` / `horaFim` | ✅ |
| `diasAtendimento` | ✅ |
| `almocoInicio` / `almocoFim` | 🔴 **não** — intervalo de almoço |
| `antecedenciaMinutos` | 🔴 **não** — antecedência mínima para agendar |
| `antecedenciaMaximaDias` | 🔴 **não** — quão longe no futuro pode agendar |
| `intervaloAposAtendimentoMinutos` | 🔴 **não** — buffer de limpeza entre atendimentos |
| `turnoExtraAtivo/Inicio/Fim` | 🔴 **não** — segundo turno (noturno) |

Nenhum desses é enfeite. O **buffer entre atendimentos** é essencial em estética automotiva e
tatuagem. A **antecedência mínima** é o que impede o cliente agendar para daqui a 5 minutos. O
**turno extra** existe porque barbearia abre à noite.

Isso é trabalho que o Bora Marcá vai descobrir que precisa — e já está resolvido lá.

---

## 4. Inventário das 49 telas por categoria

**Este é o resultado mais importante da extração.**

Categorias avaliadas: Barbeiro · Manicure · Salão · Maquiagem · Massagem · Tatuagem ·
Estética Automotiva.

### 4.1 Conclusão

**Praticamente todas as 49 telas são CORE.** Nenhuma delas é "de barbearia". O que varia por
categoria é (a) rótulo, (b) alguns campos no fluxo de agendamento, (c) módulos inteiramente
novos que o Barbershop não tem.

| Bloco | Telas | Aplica a |
| --- | --- | --- |
| **Entrada e conta** | Welcome · Login · Register · VerifyEmail · Onboarding · Perfil · Privacidade · Suporte | **todas** |
| **Agenda** | Agendamento · AgendamentoConfirmado · AgendamentoManual · AbrirAgendamento · ConfigAgenda · Folgas · Bloqueios | **todas** |
| **Recorrência e espera** | Recorrencias · CriarRecorrencia · ListaEspera | **todas** (mais forte em manicure, massagem, barbearia) |
| **Clientes** | Clientes · HistoricoCliente · Aniversariantes · ClientesBanidos | **todas** |
| **Equipe** | Equipe · EditarProfissional · PerfilProfissional · SetupBarbeiro | **todas** |
| **Serviços** | ConfigServicos | **todas** — automotiva soma preço por categoria de veículo |
| **Financeiro** | Comissoes · Despesas · VendasRelatorio · AbrirRelatorios · ConfiguracaoRelatoriosEmail | **todas** |
| **Captação** | QRCode · AbrirConvite · AdicionarCodigo · Promocao · BannerPromocional · TemplatesMensagem | **todas** |
| **Área do cliente** | ClienteHome · ClienteAgendamentosTab · ClientePerfilTab · Historico | **todas** |
| **Operação** | Inicio · BarbeiroHome · tabs (Config/Perfil/Relatorios) | **todas** |
| **Notificações** | ConfiguracaoNotificacoes | **todas** |

Específico de segmento no Barbershop inteiro: o **nome** "Barbeiro" nas telas e
`assets/barbeiros_padrao`. Só isso.

### 4.2 O que isso prova

Sua intuição sobre a manicure está correta, e é mais forte do que você colocou: **se o núcleo
estiver certo, manicure é configuração e rótulo.** Salão e maquiagem também. Massagem soma
pouco (duração maior, sala). Tatuagem soma sessões múltiplas e orçamento.

E a leitura inversa é a mais dura: **a estética automotiva é a exceção da plataforma, não a
regra.** Veículo, box, OS, checklist e fotos são o único conjunto que não deriva do Barbershop.
Hoje ela é 100% do frontend do Bora Marcá.

O projeto construiu a exceção antes da regra.

### 4.3 O que cada categoria acrescenta ao núcleo

| Categoria | Acréscimo sobre o núcleo |
| --- | --- |
| Barbeiro | nenhum — **é o núcleo** |
| Manicure | rótulos. Recorrência ganha peso |
| Salão de cabeleireiro | rótulos + serviços encadeados (química com tempo de espera) |
| Maquiagem | rótulos + atendimento externo (local do cliente) |
| Massagem | rótulos + sala como recurso + duração longa |
| Tatuagem | sessões múltiplas ligadas a um projeto + orçamento + sinal |
| **Estética automotiva** | **veículo · box · OS · checklist · fotos antes/depois · preço por categoria** |

---

## 5. Mecanismos que valem copiar como decisão

### 5.1 `ocupacoes` — disponibilidade sem dado pessoal

O problema: `agendamentos` é privado, mas o cliente precisa ver quais horários estão tomados
para montar a grade.

A solução: uma coleção separada com **apenas** `{ barbeiroId, data, horario, agendamentoId }`.
Sem nome, e-mail ou telefone. O `agendamentoId` é opaco — só quem já pode ler o agendamento
consegue ligar o slot a alguém.

**Por que importa para nós:** o Bora Marcá não tem área do cliente (Etapa 10) e vai bater
exatamente nesse problema. A resposta já existe, testada em produção.

### 5.2 Reserva atômica — e o bug que já foi corrigido lá

O comentário de `OcupacaoService.ts` documenta duas correções de auditoria:

> **1. Reserva atômica.** Antes os blocos eram marcados um a um. Duas pessoas escolhendo o mesmo
> horário conseguiam agendar as duas. Agora tudo dentro de uma `runTransaction`.
>
> **2. Liberação completa.** Um serviço de 1h ocupa dois blocos de 30 min, mas o cancelamento só
> apagava o primeiro, **deixando o resto da agenda travado para sempre**.

O segundo é **exatamente o C-7 do Bora Marcá** — reserva órfã que trava o recurso. Mesma classe
de bug, mesmo produto, encontrado e corrigido lá antes de nascer aqui.

> Sobre o primeiro: o Bora Marcá é **melhor**. A exclusion constraint GiST torna a corrida
> impossível no banco; o Barbershop precisa de transação em aplicação. Não copiar o mecanismo —
> copiar a *lição* de que liberar é tão crítico quanto reservar.

### 5.3 Reconciliação de órfãos + telemetria

As funções de liberação engolem o próprio erro de propósito (o cancelamento já foi persistido,
falhar aqui faria o usuário achar que o cancelamento falhou). Mas engolir em silêncio torna o
slot órfão invisível — então cada falha vira evento em `eventosOperacionais`, e um job
`reconciliarSlotsOrfaos` limpa o lixo.

É um padrão maduro: **falha silenciosa é aceitável, falha invisível não é.**

### 5.4 Vínculo cliente ↔ empresa

`usuarios/{uid}/vinculos/{tipo_alvoId}` com **id determinístico** — a mesma origem nunca duplica
o vínculo. Rastreia `origem` (`qr` · `link` · `codigo` · `convite`) e aponta para o profissional
específico que originou o vínculo, mesmo quando o alvo é a empresa.

**É a base da área do cliente multiempresa** — o mesmo cliente atendido por várias empresas, com
a lista das dele. O Bora Marcá não tem nada disso e precisa (Etapa 10).

### 5.5 Público vs. privado — o padrão de privacidade

Aparece três vezes, sempre com a mesma lógica:

| Dado público | Dado privado | Por quê |
| --- | --- | --- |
| `bloqueiosHorario[]` (quando) | `bloqueiosPrivados/{id}` (**motivo**) | o motivo é dado pessoal do profissional |
| — | `banidos/{uid}` | a lista antiga vivia na vitrine e expunha nome e e-mail dos banidos |
| `barbeiros/{id}.ativo` | `membros/{id}.ativo` | a vitrine não pode ler a subcoleção privada |

O segundo caso está marcado `@deprecated` com a explicação do vazamento e a migração
automática. **Isso é ouro** — é exatamente o tipo de erro que se comete de novo.

**Tradução para o Bora Marcá:** este é o padrão que resolve o **C-8** (todo membro lê CPF,
telefone e e-mail de todos os clientes). Coluna sensível separada do que é operacional.

### 5.6 Idempotência de notificação

`agendamentos/{id}/notificacoes/{envioId}` — histórico de envio, dado interno, sem leitura pelo
cliente. Junto com `EventoNotificacao` de granularidade fina (`agendamento_cancelado_cliente` vs
`agendamento_cancelado_profissional`), separada da granularidade que o usuário liga/desliga.

Essa distinção — **granularidade do sistema ≠ granularidade da configuração** — é uma decisão de
design que economiza uma refatoração inteira. Vale direto para a Etapa 9.

### 5.7 Padrões de compatibilidade

`CONFIGURACAO_NOTIFICACOES_PADRAO` documenta por que cada default é o que é:

> `whatsapp: true` — único canal que existe hoje; não pode "sumir" para quem já usava.
> `sms: false` — canal novo; só liga quando o profissional decidir **e** o provedor existir.
> todos os 4 eventos `true` — desligar por padrão seria regressão silenciosa.

Feature nova nasce desligada; comportamento existente nunca muda sozinho.

---

## 6. LGPD — o que já está resolvido

O Bora Marcá tem **zero** disto. O Barbershop tem tudo:

| Prática | Como |
| --- | --- |
| Consentimento explícito | `consentimentoLGPD` + `consentimentoEm` |
| Consentimento separado por finalidade | `consentimentoNotificacoesPush` próprio — *"ausente significa opt-in pendente, nunca autorização implícita"* |
| Minimização | `aniversario` como `"MM-DD"` — **sem ano**. Aniversário sem idade |
| Minimização | `ocupacoes` sem nenhum dado pessoal |
| Separação por sensibilidade | motivo do bloqueio e lista de banidos fora da vitrine |
| Exclusão real | `ExclusaoContaService` + `UsuarioRepository.deleteProfile` + tela `Privacidade` |
| Retenção consciente | campanha de retorno nasce desativada, push-only, porque WhatsApp e SMS exigem consentimento próprio |

A Etapa 7 do plano (LGPD) deixa de ser design do zero e vira **tradução**.

---

## 7. Problemas que o Barbershop já resolveu e o Bora Marcá ainda tem

Da `AUDITORIA.md` (9 etapas) cruzada com a nossa auditoria:

| Problema resolvido lá | Situação aqui |
| --- | --- |
| Liberação incompleta de slot trava a agenda | **C-7 aberto** |
| Regras de Firestore ausentes → acesso total | análogo aos **C-1/C-3** (grants abertos) |
| Vazamento de dados entre profissionais | **C-8 aberto** |
| Escalonamento de privilégio por role no cliente | evitado por construção (RLS) ✅ |
| Preço como string parseada em todo lugar | evitado — `numeric` ✅ |
| Índices compostos ausentes (falha em runtime) | evitado ✅ |
| Leitura de coleção inteira sem paginação | **C-17 aberto** — relatórios baixam tudo |
| Cache existe mas não é usado | sem cache aqui |
| Analytics recalculado do zero a cada abertura | **C-17** |
| Disponibilidade de horários irreal | parcialmente — falta `ConfiguracaoAgenda` completa |
| Sem verificação de e-mail | não temos fluxo de cadastro |
| Fluxo de pagamento confuso | decisão tomada lá: **nunca simular "pagamento aprovado"** |

A última é uma regra de produto que vale adotar: o modal diz *"Combinar forma de pagamento"*,
pagamento no local. **Nunca fingir que processou.**

---

## 8. O que NÃO trazer

| Não trazer | Motivo |
| --- | --- |
| Dois modelos de tenant convivendo | migração inacabada lá; já nascemos certos |
| `barbeiros/{id}` como tenant | confunde profissional com empresa |
| Preço como `string` `"25,00"` | legado explicitamente marcado como tal |
| Desnormalização de vitrine (`negocioNome`, `ativo`) | existe porque Firestore não faz join; PostgreSQL faz |
| `disponivelHoje` / `disponivelAmanha` por Function agendada | uma view ou índice resolve sem job |
| 257 emojis como ícone | dívida visual reconhecida, nota 5,2/10 |
| 23 tamanhos de fonte, 19 raios, 270 hex na mão | mesma dívida |
| Bottom tabs | decisão de mobile; nosso alvo é web |
| Paleta âmbar + azul-profundo | escolhida **para barbearia**. Numa plataforma multi-categoria, vira tema de segmento — não tema do produto |
| `TipoUsuario = cliente \| barbeiro` | nosso modelo de 5 papéis é melhor |

> Sobre a paleta: a decisão está registrada como vinculante no Barbershop e conversa com a
> identidade de barbearia (poste listrado, navalha, couro). Isso é exatamente o que o contexto
> mestre chama de **tema visual por segmento**. A decisão continua válida — para o segmento.

---

## 9. O que isto muda no plano

### 9.1 O plano estava subdimensionado

Escrevi o plano sem ter visto o Barbershop. Faltam nele:

- **Recorrência** e **lista de espera** — não aparecem em nenhuma etapa
- **`ConfiguracaoAgenda` completa** — almoço, antecedência mín./máx., buffer, turno extra
- **Avaliação** de atendimento
- **Vínculo cliente ↔ empresa** — pré-requisito real da Etapa 10
- **Convite por código/QR** — pré-requisito real da Etapa 5
- **Banimento de cliente**
- **Idempotência de notificação**
- **Relatório financeiro por e-mail**
- **Templates de mensagem** e **banner promocional**

### 9.2 Barbearia sobe de posição

O plano tinha Barbearia como **Etapa 12, a última**. Está errado. Ela é a **implementação de
referência** da qual todas as outras categorias derivam. Deve vir logo após a Etapa 3
(reestruturação), e antes de completar o automotivo.

Ordem corrigida:

```
0 ─ rede de segurança          (feito)
1 ─ privilégios
2 ─ bugs que corrompem
3 ─ reestruturar frontend + servidor
4 ─ NÚCLEO a partir do Barbershop      ← nova, e é o coração
5 ─ Barbearia como segmento de referência
6 ─ fechar Agenda ↔ Pátio (automotivo)
7 ─ Manicure / Salão / Maquiagem       ← baratas, provam a arquitetura
…
```

### 9.3 Falta "Maquiagem" no enum

`business_type` tem 10 valores e nenhum é maquiagem. Precisa de migration.

### 9.4 A Etapa 3 fica ainda mais crítica

Se ~49 telas core estão vindo do Barbershop, construí-las sem a fronteira core/módulo seria
catastrófico. **A reestruturação não é dívida técnica — é pré-requisito de escala.**

---

## 10. Próximos passos sugeridos

1. **Corrigir `docs/foundation.md:3`** — a afirmação de que o Barbershop não existia é falsa e
   está sustentando a decisão errada de ordem dos segmentos.
2. **Ler `src/types.ts` inteiro** antes de qualquer modelagem nova. 611 linhas, todas comentadas.
3. **Migration do núcleo**: `ConfiguracaoAgenda` completa, avaliação, recorrência, lista de
   espera, vínculo, convite, comissão, despesa, consentimento LGPD.
4. **Portar os agentes** re-escopados, incluindo o de arquitetura de segmentos que não existe.
5. **Registrar como ADR** a decisão de que o Barbershop é o núcleo e a automotiva é um módulo.

---

## Anexo — nota operacional

`CLAUDE.md` do Barbershop registra que **dois tokens do GitHub foram colados no chat em sessões
anteriores e devem ser tratados como comprometidos**. O arquivo também alerta que o remote do git
pode conter token embutido. Se ainda não foram revogados, vale fazer em
`github.com/settings/tokens`. Não é assunto desta extração, mas é risco aberto e registrado.
