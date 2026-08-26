# Como prosseguir — Bora Marcá

**Data:** 25/08/2026 · Síntese da auditoria, do plano, da extração do Barbershop e do Contexto Mestre.

---

## 1. Onde estamos

| Entregue | O que é |
| --- | --- |
| `docs/auditoria-2026-08-25.md` | 23 achados verificados no código |
| `docs/plano-execucao.md` | 14 etapas ordenadas por dependência |
| `docs/barbershop-extracao-dominio.md` | a análise que a Fase 1 exigia e nunca aconteceu |
| **Etapa 0 concluída** | 80 asserções pgTAP, isolamento entre tenants, matriz de papéis, CI, README |
| **`.ai-team/` com 10 agentes** | re-escopados para Supabase, Next.js e multi-categoria |

Falta executar da Etapa 1 em diante. Nenhuma linha de barbearia existe ainda.

---

## 2. O Contexto Mestre estava certo. A implementação é que desviou.

Isto precisa ficar registrado, porque muda a conversa: **o documento não errou.**

> **§18 — PRIMEIRO SEGMENTO BASE**
> *"A Barbearia será o primeiro segmento porque o Barbershop já existe. Não é necessário
> reconstruir tudo agora. A intenção é fazer o que já existe funcionar dentro da nova arquitetura."*

Essa frase é exatamente a direção correta, e foi escrita antes de tudo. O que aconteceu foi o
oposto: 11 de 11 commits automotivos, Fase 2 em 0%, e `docs/foundation.md:3` afirmando —
**falsamente** — que o Barbershop não existia, o que sustentou a inversão.

O §2 lista o Barbershop como referência de arquitetura, UX, autenticação, agenda, clientes,
profissionais, serviços, financeiro, notificações, segurança, LGPD e problemas já corrigidos.
**A extração confirmou todos os treze itens.** A lista estava certa; ninguém foi olhar.

Conclusão: não é caso de reescrever o Contexto Mestre. É caso de **cumpri-lo**, com as emendas
abaixo.

---

## 3. O que o Contexto Mestre precisa corrigir

### 3.1 Falta a categoria Maquiagem

O §3 lista 10 segmentos e o §8 define o enum com os mesmos 10. **Maquiagem não está em nenhum
dos dois**, e o banco também não tem. Precisa de emenda no documento e de migration.

### 3.2 A ordem do §53 está invertida

O §53 — *"ORDEM RECOMENDADA PARA IMPLEMENTAÇÃO AUTOMOTIVE"* — tem 24 itens e começa por
BusinessType, SegmentConfig, Feature Flags e Labels. Os quatro primeiros estão certos e são de
plataforma, não de automotivo. Os outros vinte são todos do módulo.

Falta o documento equivalente para o **núcleo**, que é o que realmente vem primeiro. Proposta na
seção 4.

### 3.3 Onze coisas que o Barbershop tem e o Contexto Mestre não menciona

Nenhuma delas aparece no documento, e todas existem prontas no projeto anterior:

| Ausente do Contexto Mestre | Onde está no Barbershop |
| --- | --- |
| Agendamento **recorrente** (semanal/quinzenal/mensal) | `Recorrencia` + 2 telas |
| **Lista de espera** por data | `EntradaListaEspera` + tela |
| **Avaliação** de atendimento | `Avaliacao` + status `avaliado` |
| **Vínculo cliente ↔ empresa** por QR, link, código ou convite | `VinculoCliente`, id determinístico |
| **Convite** por código | `convites/{codigo}` + 3 telas |
| **Banimento** de cliente | `ClienteBanido`, em subcoleção privada |
| **Templates de mensagem** com variáveis | `TemplatesMensagem` + tela |
| **Banner promocional** | `BannerPromocional` |
| **Configuração de agenda completa** | almoço, antecedência mín./máx., buffer, turno extra |
| **Idempotência de envio** de notificação | `agendamentos/{id}/notificacoes/{envioId}` |
| **Relatório financeiro por e-mail** | `ConfiguracaoRelatorioEmail` |

O §43 (Financeiro) já pede comissão e contas a pagar — o Barbershop tem `Comissoes` e `Despesas`
funcionando. O §39 (Área do cliente) descreve como futuro algo que **já existe completo lá**.

### 3.4 A maior lacuna isolada: configuração de agenda

O Contexto Mestre trata agenda no §25 sem detalhar configuração. O Barbershop tem 9 campos;
nosso banco tem 3. Faltam **intervalo de almoço**, **antecedência mínima**, **antecedência
máxima**, **buffer entre atendimentos** e **turno extra**.

O buffer é essencial em estética automotiva e tatuagem. A antecedência mínima é o que impede o
cliente agendar para daqui a cinco minutos. Nenhum é enfeite.

### 3.5 Decisão pendente: status do agendamento

O §26 define 5 status. O Barbershop tem `avaliado` e não tem `in_progress`; nós temos o inverso.

**Recomendação:** manter os 5 atuais e tratar avaliação como entidade própria. Status que existe
só para marcar "já avaliou" mistura duas dimensões.

### 3.6 Defeitos de numeração

O documento tem **duas seções 48** (Segurança e LGPD) e **duas seções 55** (Decisões e Como uma
IA deve responder). Não existem §47 nem §54. É pequeno, mas o documento é a fonte de verdade e
as seções são citadas por número.

### 3.7 §58 está desatualizada

Diz *"Novo SaaS está sendo especificado"* e *"o próximo passo técnico é analisar o código base,
desenhar o schema e iniciar a Fase 1"*. Hoje: schema pronto, módulo automotivo funcional,
auditoria feita, Fase 1 parcialmente concluída.

---

## 4. A ordem corrigida

O §53 cobre o módulo automotivo. Falta a ordem do **núcleo**, que vem antes. Proposta:

### ORDEM RECOMENDADA PARA O NÚCLEO

| # | Item | Origem |
| --- | --- | --- |
| 1 | Privilégios de tabela e função fechados | auditoria C-1, C-2, C-3 |
| 2 | Bugs de operação corrigidos | C-5 a C-14 |
| 3 | Catálogo de segmentos dentro do build | §11, §12 |
| 4 | Tipo de negócio lido do banco pela interface | §8 |
| 5 | Labels dinâmicas | §13 |
| 6 | Camada de permissões | §14 |
| 7 | Fronteira núcleo × módulo no frontend | §4, §16 |
| 8 | Camada de servidor | pré-requisito de 15, 18, 19, 20 |
| 9 | Onboarding com escolha de categoria | §9 |
| 10 | Cadastros: serviços, profissionais, clientes | §20 |
| 11 | Configuração de agenda completa | Barbershop |
| 12 | Bloqueios, folgas e motivo privado | Barbershop |
| 13 | Recorrência e lista de espera | Barbershop |
| 14 | Convite e vínculo cliente ↔ empresa | Barbershop |
| 15 | Notificações com abstração de provider | §41, §42 |
| 16 | Avaliação de atendimento | Barbershop |
| 17 | Financeiro: comissão, despesa, caixa | §43 |
| 18 | Relatórios com recorte de período | §43 |
| 19 | LGPD: consentimento, retenção, anonimização | §48 |
| 20 | Área do cliente | §39 |
| 21 | Planos e assinaturas | §45 |

Só depois disso o §53 (automotivo) faz sentido como módulo, e as demais categorias custam
configuração.

### Sequência macro

```
Etapa 0  rede de segurança                     ✅ feito
Etapa 1  privilégios                           ← próxima
Etapa 2  bugs que corrompem a operação
Etapa 3  reestruturar frontend + servidor      ← ponto de não-retorno
Etapa 4  NÚCLEO a partir do Barbershop
Etapa 5  Barbearia como categoria de referência
Etapa 6  fechar Agenda ↔ Pátio (automotivo)
Etapa 7  Manicure, salão, maquiagem
```

---

## 5. Os próximos três passos

### Passo 1 — Emendar o Contexto Mestre e corrigir a mentira

Rápido e destrava a comunicação do projeto:

- adicionar **Maquiagem** ao §3, ao §8 e ao enum do banco
- corrigir `docs/foundation.md:3`
- acrescentar a **ordem do núcleo** (seção 4 acima) como §53-A
- acrescentar as onze funcionalidades da seção 3.3
- atualizar o §58
- corrigir a numeração duplicada
- registrar como ADR: *o Barbershop é o núcleo, a estética automotiva é um módulo*

### Passo 2 — Etapa 1: fechar os privilégios

O teste `00_privilege_snapshot.sql` já existe e está marcado `TODO`. A Etapa 1 o torna verde.

⚠️ **A armadilha está confirmada no código:** as 6 tabelas da fundação não têm um único `grant`
explícito — funcionam pelo default do Supabase. Revogar sem reconceder no mesmo passo **derruba
o aplicativo inteiro**. A matriz de destino está no plano.

### Passo 3 — Etapa 2: os bugs que corrompem a operação

Reserva de box com fim previsto, agendamento que fecha ao virar OS, pagamento validado contra o
total, uma OS ativa por veículo. Os testes de aceite já estão escritos em `50_known_defects.sql`.

Depois disso, a Etapa 3 — e é ela que decide se o produto vira plataforma ou continua sendo um
app automotivo com um enum de dez valores.

---

## 6. Como os agentes entram

`.ai-team/` tem dez especialistas versionados no repositório e gerados como subagentes do Claude
Code em `.claude/agents/`.

Duas mudanças em relação aos nove herdados:

- **06 deixou de ser Firebase e virou Supabase** — manter um especialista de Firebase induziria a
  copiar o modelo NoSQL, que é exatamente o que o §6 do Contexto Mestre proíbe.
- **10 - Segmentos é novo.** Nenhum dos nove cuidava da fronteira núcleo × módulo — e essa
  ausência é a causa raiz do maior desvio do projeto.

O agente 10 tem um **teste de decisão** explícito:

1. Mais de uma categoria se beneficia? → núcleo
2. Existe no extrato do Barbershop? → núcleo, já provado
3. A diferença é só de nome? → núcleo + label
4. Introduz entidade que só faz sentido numa categoria? → módulo
5. Na dúvida → núcleo

O fluxo recomendado passa por ele sempre que a demanda puder servir a mais de uma categoria.
Roteiro em `.ai-team/prompts/01-fluxo-de-feature-boramarca.md`.

---

## 7. Decisões que preciso de você

| # | Decisão | Recomendação |
| --- | --- | --- |
| 1 | **Existe uso em produção hoje?** | Se sim, C-1/C-3 viram hotfix e as Etapas 0 e 1 se invertem |
| 2 | Feature parity com o Barbershop, ou subconjunto? | Subconjunto: itens 1–14 da ordem do núcleo primeiro |
| 3 | Avaliação: status ou entidade? | Entidade própria |
| 4 | Duração prevista da ocupação de box | Soma dos itens, com piso configurável por empresa |
| 5 | Convite de membros por e-mail | Sim — depende da camada de servidor da Etapa 3 |
| 6 | Exclusão de cliente | Anonimizar, não apagar (retenção contábil impede) |

Nenhuma bloqueia começar o Passo 1.

---

## O ponto que decide tudo

O Contexto Mestre já dizia o certo no §18. A extração provou por que: **praticamente as 49 telas
do Barbershop são núcleo** — nenhuma é de barbearia.

Enquanto a Etapa 3 não acontecer, cada tela automotiva nova aumenta o preço de tornar o produto
multi-categoria. Chega um momento em que o caminho mais barato passa a ser abandonar a promessa.

Ainda não chegamos lá. Faltam seis componentes para refatorar, não sessenta.
