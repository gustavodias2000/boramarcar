# Fundação inicial — Bora Marcá

> **Correção de 25/08/2026.** A primeira versão deste documento afirmava que o repositório havia
> sido iniciado "sem código-base e sem uma cópia do Barbershop". **A afirmação era falsa.** O
> projeto anterior existe em `D:\Claude\BarberShop` — 30.111 linhas, 49 telas, 14 repositories,
> 420 testes e documentação própria de auditoria.
>
> A consequência não foi pequena: essa frase sustentou a inversão da ordem dos segmentos definida
> no §18 do Contexto Mestre. A análise que a Fase 1 exigia foi feita só agora e está em
> [barbershop-extracao-dominio.md](barbershop-extracao-dominio.md). O registro da decisão está em
> [adr/0004](adr/0004-barbershop-e-o-nucleo-da-plataforma.md).

A fundação foi construída sem pressupor um framework de interface, e estabelece o núcleo
independente de framework.

## O que existe

- Uma migration Supabase/PostgreSQL para perfis, empresas, membros, clientes, profissionais, serviços e agendamentos.
- Isolamento obrigatório por `tenant_id`, relações compostas que impedem referenciar registros de outro tenant e índices para os acessos iniciais.
- RLS habilitado em todas as tabelas expostas. Um usuário só consulta dados da empresa da qual é membro ativo.
- Papéis iniciais (`owner`, `manager`, `receptionist`, `professional`, `cashier`) aplicados nas permissões básicas de cadastro e agenda.
- Gatilho de criação de perfil a partir de `auth.users`, sem duplicar credenciais no schema público.
- Catálogo TypeScript centralizado de segmentos, labels e feature flags. A UI deve consultar `hasFeature` e `getSegmentConfig`, nunca ramificar diretamente por tipo de negócio.

> ✅ **Resolvido na Etapa 3.** O catálogo saiu da raiz morta e vive em
> `packages/core/src/segments`, compartilhado entre site e app. A regra acima deixou de ser
> intenção: a interface lê `business_type` do banco, deriva a navegação de `hasFeature` e
> tira os rótulos do catálogo. O `tsconfig` do pacote omite a lib `DOM` e um verificador
> recusa import de framework, então o agnosticismo é checado, não prometido.
> Ver [ADR 0005](adr/0005-nucleo-compartilhado-entre-site-e-app.md).

## Agenda transacional

A segunda migration adiciona recursos de agenda, disponibilidade recorrente, bloqueios e reservas protegidas contra sobreposição no banco. Um profissional passa a ter um recurso exclusivo; um box Automotive é outro recurso do mesmo tipo. A criação, o reagendamento e as transições de status do agendamento passam por funções transacionais, impedindo que uma gravação direta ignore a reserva de capacidade.

> ✅ **Completada na Etapa 4.** `professional_schedule_settings` acrescentou intervalo de
> almoço, antecedência mínima e máxima, buffer entre atendimentos e turno extra. A tabela é
> opcional: profissional sem linha se comporta como antes. Ver §61 do Contexto Mestre.

## Decisões deliberadamente adiadas

- Planos, financeiro, notificações e permissões granulares por ação: serão migrations próprias, para manter a primeira fundação pequena e auditável.

## Decisões adiadas que já venceram

- **A interface web.** Existe desde então: Next.js 16 + React 19 + Tailwind 4, em `web/`. Desde a Etapa 3 ela se adapta a qualquer categoria — recursos, rótulos e navegação vêm do catálogo de segmentos.
- **Tabelas Automotive.** Entregues: veículos, boxes, OS, checklist, fotos e eventos.
- **Preço por categoria de veículo.** Este documento prometia a funcionalidade junto da migration de módulo. A migration foi escrita **sem ela** e a promessa nunca foi cumprida nem retirada. Continua pendente — Etapa 6 do plano de execução.

## Aplicação e validação

As migrations foram aplicadas contra o projeto Supabase de desenvolvimento vinculado.

Para aplicar do zero e rodar a suíte, ver o [README](../README.md). O comando é
`npm run db:reset` seguido de `npm run test:db`.

> A validação com dois usuários de empresas diferentes que este documento recomendava **agora é
> automática**: `supabase/tests/10_tenant_isolation.sql` cria dois tenants completos e verifica
> `select`, `insert`, `update` e `delete` cruzados, sob identidade autenticada real.
