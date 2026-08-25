# Fundação inicial — Bora Marcá

O repositório foi iniciado sem código-base e sem uma cópia do Barbershop. Por isso, esta primeira entrega evita pressupor um framework de interface ou migrar comportamento inexistente e estabelece somente o núcleo independente de framework.

## O que existe

- Uma migration Supabase/PostgreSQL para perfis, empresas, membros, clientes, profissionais, serviços e agendamentos.
- Isolamento obrigatório por `tenant_id`, relações compostas que impedem referenciar registros de outro tenant e índices para os acessos iniciais.
- RLS habilitado em todas as tabelas expostas. Um usuário só consulta dados da empresa da qual é membro ativo.
- Papéis iniciais (`owner`, `manager`, `receptionist`, `professional`, `cashier`) aplicados nas permissões básicas de cadastro e agenda.
- Gatilho de criação de perfil a partir de `auth.users`, sem duplicar credenciais no schema público.
- Catálogo TypeScript centralizado de segmentos, labels e feature flags. A UI deve consultar `hasFeature` e `getSegmentConfig`, nunca ramificar diretamente por tipo de negócio.

## Decisões deliberadamente adiadas

- A interface web/mobile e a escolha do framework: não havia projeto a analisar.
- A regra definitiva de conflito de agenda: ela precisa considerar profissionais, boxes e os requisitos do módulo Automotive antes de ser consolidada em uma constraint transacional.
- Tabelas Automotive (veículos, boxes, preços por categoria, OS, checklist e fotos): pertencem a uma migration de módulo, depois que a fundação for aplicada e validada.
- Planos, financeiro, notificações, Storage e permissões granulares por ação: serão migrations próprias, para manter a primeira fundação pequena e auditável.

## Aplicação e validação

Quando o projeto Supabase estiver conectado, aplique a migration pelo fluxo versionado escolhido para o repositório (por exemplo, `supabase db push`). Antes de promover, teste com pelo menos dois usuários pertencentes a empresas diferentes e confirme que as operações de `select`, `insert`, `update` e `delete` não atravessam o tenant.

Não há CLI Supabase, Docker ou servidor PostgreSQL disponível neste ambiente; a migration foi revisada estaticamente, mas ainda precisa ser executada contra um projeto Supabase de desenvolvimento.
