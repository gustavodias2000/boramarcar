# DECISOES

<!-- Registra decisões importantes e evita perda de contexto ao longo do tempo. -->
<!-- Sempre registre decisão, motivo, impacto e próxima revisão. -->

## Como registrar

### [AAAA-MM-DD] Título curto da decisão

- Contexto:
- Decisão:
- Motivo:
- Impacto:
- Revisar novamente em:

---

## Decisões registradas

### [2026-08-25] O Barbershop é o núcleo; a estética automotiva é um módulo

- Contexto: o projeto foi construído automotivo-primeiro. 11 de 11 commits e 100% da interface
  atendem uma única categoria. A Fase 2 (Barbearia) está em 0%. A extração de domínio mostrou
  que praticamente as 49 telas do Barbershop são núcleo, não específicas de barbearia.
- Decisão: tratar o domínio do Barbershop como o núcleo da plataforma. A estética automotiva
  passa a ser o primeiro **módulo**, não o produto.
- Motivo: o inventário de funcionalidades de um SaaS de serviços já existe e está validado em
  produção. Construir a exceção antes da regra encarece cada categoria seguinte.
- Impacto: a Barbearia sai da última etapa do plano e vira implementação de referência. Manicure,
  salão e maquiagem passam a custar configuração e rótulo.
- Revisar novamente em: ao concluir a primeira categoria derivada do núcleo.

### [2026-08-25] O código do Barbershop não será portado; o domínio sim

- Contexto: Barbershop é React Native + Firebase; Bora Marcá é Next.js + Supabase.
- Decisão: reuso de código próximo de zero; reuso de domínio, regras, decisões de privacidade e
  problemas já resolvidos.
- Motivo: os paradigmas são incompatíveis, mas as decisões de produto não dependem de stack.
- Impacto: `docs/barbershop-extracao-dominio.md` vira leitura obrigatória antes de modelar algo novo.
- Revisar novamente em: se surgir alvo mobile que reabra a discussão de compartilhar código.

### [2026-08-25] Criar o agente de Segmentos

- Contexto: nenhum dos nove agentes herdados cuidava da fronteira núcleo × módulo. O catálogo de
  segmentos foi escrito e nunca consumido por ninguém.
- Decisão: criar `10 - Segmentos`, com um teste de decisão explícito.
- Motivo: a ausência desse papel é a causa raiz do maior desvio arquitetural do projeto.
- Impacto: toda demanda passa a ter uma classificação registrada antes de virar código.
- Revisar novamente em: após três demandas classificadas por ele.

### [2026-08-25] O agente de Firebase vira agente de Supabase

- Contexto: o banco principal é PostgreSQL no Supabase; o Firestore é só referência.
- Decisão: substituir `06 - Firebase` por `06 - Supabase`, com foco em RLS, privilégios, funções
  transacionais, migrations e Storage.
- Motivo: manter um especialista de Firebase induziria a copiar o modelo NoSQL.
- Impacto: o roteamento do Coordenador foi atualizado.
- Revisar novamente em: se o Firebase voltar para push/FCM.

### [2026-08-25] O AI-Team do Bora Marcá vive no próprio repositório

- Contexto: no Barbershop, `.ai-team` era espelho de uma pasta externa sincronizada por script.
- Decisão: no Bora Marcá, `.ai-team/agents` é a **fonte de verdade**, versionada no repositório.
  O script apenas gera `.claude/agents` a partir dela.
- Motivo: os agentes foram re-escopados para este projeto; um espelho externo genérico voltaria a
  divergir. Versionar junto do código mantém agente e realidade sincronizados.
- Impacto: sem dependência de pasta externa. Editar o agente é um commit como qualquer outro.
- Revisar novamente em: se um terceiro projeto precisar da mesma base.

### [2026-08-25] Scaffolding de teste fora das migrations

- Contexto: `supabase test db` precisa de pgTAP, mas `db push` levaria tudo para produção.
- Decisão: pgTAP e o esquema `tests` são carregados por `[db.seed] sql_paths`, que só roda local.
- Motivo: a Etapa 1 adiciona um teste que afirma quais funções são executáveis em produção;
  publicar mil funções de teste junto anularia o propósito.
- Impacto: os testes rodam local e no CI, nunca em ambiente publicado.
- Revisar novamente em: se surgir necessidade de rodar a suíte contra um ambiente remoto.

### [2026-08-25] Defeito conhecido vira teste marcado TODO

- Contexto: corrigir os achados da auditoria sem rede de teste repetiria a condição que os criou.
- Decisão: cada defeito conhecido tem teste escrito com o comportamento **correto**, embrulhado em
  `todo_start`/`todo_end`.
- Motivo: mantém o CI verde, deixa a lacuna visível na saída, e o `pg_prove` avisa quando um TODO
  passa — sinal de que o wrapper pode sair.
- Impacto: o plano de correção virou critério verificável pelo build.
- Revisar novamente em: quando as Etapas 1 e 2 fecharem.
