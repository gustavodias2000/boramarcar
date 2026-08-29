# CONTEXTO

<!-- Contexto geral do projeto atendido pelos agentes. -->
<!-- Atualize sempre que a visão do produto, a stack ou o público mudarem. -->

## Projeto atual

Nome: `Bora Marcá` (provisório)

Tipo: SaaS multiempresa e **multi-categoria** para negócios de serviço com agendamento.

## Visão resumida

O produto **não é um sistema de barbearia** e **não é um sistema de estética automotiva**.

É uma plataforma única que atende, por configuração e regra de negócio:

- Barbearia
- Manicure / Nail Designer
- Salão de cabeleireiro
- Maquiagem
- Massoterapia
- Estúdio de tatuagem
- Estética automotiva
- Sobrancelhas, estética facial e corporal, depilação, pet shop
- outras que vierem

Adicionar uma categoria não pode exigir duplicar o aplicativo.

## Regra de ouro

**CORE comum + MÓDULOS específicos por categoria.**

O núcleo cobre autenticação, empresas, usuários, membros, permissões, clientes, agenda,
serviços, profissionais, financeiro, caixa, notificações, planos, relatórios, LGPD e auditoria.

O módulo cobre o que só existe naquela categoria — na automotiva: veículo, box, ordem de
serviço, checklist, fotos antes/depois e preço por categoria de veículo.

## De onde vem o núcleo

Do projeto anterior **Barbershop** (React Native + Firebase, 30 mil linhas, 49 telas, 420 testes).

A extração de domínio está em `docs/barbershop-extracao-dominio.md`. A conclusão que orienta
todo o trabalho: **praticamente todas as 49 telas do Barbershop são núcleo** — nenhuma é "de
barbearia". A estética automotiva é a exceção da plataforma, não a regra.

O código do Barbershop **não porta** (React Native não roda em Next.js, Firestore não vira SQL).
O que se aproveita é o domínio: modelo, regras, decisões de privacidade e problemas já resolvidos.

## Premissas atuais

- Cada empresa opera em isolamento de tenant. Dados de empresas diferentes nunca se misturam.
- O isolamento é responsabilidade do banco (RLS + FK composta), não do frontend.
- Arquitetura e segurança têm prioridade sobre atalho de implementação.
- LGPD é requisito de arquitetura, não funcionalidade opcional.

## Stack

- Next.js 16 · React 19 · TypeScript strict · Tailwind 4
- Supabase: PostgreSQL, Auth, Row Level Security, Storage privado, Edge Functions
- pgTAP para testes de banco · GitHub Actions

## Dois alvos: site e aplicativo

O produto terá **site e app**, e o app atende **também a equipe** — técnico no pátio
fotografando pelo celular, profissional consultando a própria agenda. É o mesmo desenho do
Barbershop, que roda equipe e cliente no mesmo binário.

Consequência para toda decisão de código: o núcleo vive em `packages/core`, **agnóstico de
framework** — zero React, zero React Native, zero DOM. Catálogo de segmentos, permissões, tipos
de domínio e acesso a dados servem os dois lados. A camada de dados **recebe** um
`SupabaseClient` em vez de criar um, porque web e app o constroem de formas diferentes.

Antes de escrever algo novo, pergunte: isto é do núcleo compartilhado, da web, ou do app?
Ver `docs/adr/0005-nucleo-compartilhado-entre-site-e-app.md`.

## Papéis do produto

- proprietário (owner)
- gerente (manager)
- recepcionista (receptionist)
- profissional (professional)
- caixa (cashier)
- cliente final — área do cliente ainda não existe

## Estado real

Etapas 0 a 6 do plano concluídas. 29 migrations, 162 asserções pgTAP, zero `TODO`.

- Privilégios fechados e verificados por um snapshot que reprova qualquer função nova até
  ser conscientemente aberta.
- O **núcleo multi-categoria existe na aplicação**: a interface lê `business_type` do banco,
  deriva a navegação de `hasFeature`, tira rótulos do catálogo e usa uma camada de permissões
  que espelha as funções de papel do banco.
- Abrir empresa é uma tela: categoria escolhida, catálogo sugerido criado junto.
- Agenda e Pátio conversam: abrir OS a partir do agendamento, atribuir técnico e box.
- Escrita direta praticamente eliminada — sobrou o usuário editando o próprio perfil.

**Ainda não existe:** LGPD (consentimento, retenção, anonimização), financeiro completo,
notificações, área do cliente, planos, estoque, preço por categoria de veículo e checklist
estruturado.

Auditoria em `docs/auditoria-2026-08-25.md`. Plano em `docs/plano-execucao.md`.
Estado corrente em `ROADMAP.md`.
