-- Etapa 1 — fechar a superfície de privilégios (achados C-1, C-2 e C-3).
--
-- O PROBLEMA
--
-- `revoke ... from public` NÃO remove os grants que o Supabase concede a `anon` e
-- `authenticated` por ALTER DEFAULT PRIVILEGES. As migrations anteriores revogaram
-- apenas de `public`, exceto a 20260824001000, que documentou o problema e corrigiu
-- somente as seis funções de mídia. Resultado:
--
--   C-1  ~31 funções continuam com EXECUTE para anon/authenticated.
--   C-2  next_automotive_work_order_number é SECURITY DEFINER, escreve e não valida
--        nada — alcançável por qualquer chamador da API.
--   C-3  as seis tabelas da fundação mantêm ALL, incluindo TRUNCATE, que NÃO é
--        filtrado por RLS: destruição cross-tenant de toda a plataforma.
--
-- A ARMADILHA
--
-- Aquelas seis tabelas nunca receberam um `grant` explícito: funcionam hoje só pelo
-- default do Supabase. Revogar sem reconceder no mesmo passo derruba o aplicativo.
-- Por isso esta migration revoga e concede junto, tabela por tabela.
--
-- O QUE PRECISA SOBREVIVER
--
-- Nove funções auxiliares são chamadas DENTRO das políticas RLS. Expressão de
-- política é avaliada com o privilégio de quem consulta, então sem EXECUTE nelas
-- toda consulta falharia. Estão na lista de concessão abaixo.
--
-- As demais (assert_automotive_business, require_available_professional_resource,
-- next_automotive_work_order_number, parse_/is_valid_ de caminho de mídia,
-- is_tenant_finance_operator e os gatilhos) só são chamadas de dentro de funções
-- SECURITY DEFINER, que rodam como o dono. O chamador não precisa de EXECUTE.
--
-- `service_role` não é tocada: é a chave administrativa e ignora RLS por desenho.

-- ---------------------------------------------------------------------------
-- 1. Tabelas e views
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- Núcleo — escrita permitida pelas políticas de cadastro
grant select, update                         on public.profiles                  to authenticated;
grant select, insert, update, delete         on public.businesses                to authenticated;
grant select, insert, update, delete         on public.business_members          to authenticated;
grant select, insert, update, delete         on public.customers                 to authenticated;
grant select, insert, update, delete         on public.professionals             to authenticated;
grant select, insert, update, delete         on public.services                  to authenticated;

-- Núcleo — agenda. Escrita só por RPC transacional, exceto disponibilidade
-- recorrente, que a interface ainda grava direto (migrar para RPC na Etapa 4).
grant select                                 on public.appointments              to authenticated;
grant select, insert, update, delete         on public.professional_schedule_rules to authenticated;
grant select                                 on public.scheduling_resources      to authenticated;
grant select                                 on public.scheduling_resource_reservations to authenticated;
grant select                                 on public.appointment_events        to authenticated;

-- Módulo automotivo — leitura, com escrita concentrada nas RPCs
grant select, insert, update, delete         on public.automotive_vehicles       to authenticated;
grant select                                 on public.automotive_boxes          to authenticated;
grant select                                 on public.automotive_work_orders    to authenticated;
grant select                                 on public.automotive_work_order_intakes to authenticated;
grant select                                 on public.automotive_work_order_items to authenticated;
grant select                                 on public.automotive_work_order_payments to authenticated;
grant select                                 on public.automotive_work_order_deliveries to authenticated;
grant select                                 on public.automotive_work_order_events to authenticated;
grant select                                 on public.automotive_work_order_media to authenticated;
grant select                                 on public.automotive_loyalty_programs to authenticated;
grant select                                 on public.automotive_loyalty_entries to authenticated;
grant select                                 on public.automotive_patio          to authenticated;

-- automotive_work_order_number_counters fica deliberadamente SEM grant e SEM
-- política: só a função SECURITY DEFINER que numera as OS a alcança.
--
-- automotive_work_order_media perdeu INSERT e DELETE em relação ao grant anterior.
-- A migration 20260824000700 dropou as políticas de escrita dessa tabela, então o
-- privilégio ficou órfão: RLS já barrava a gravação direta. A escrita real acontece
-- pelas RPCs register_/remove_ (SECURITY DEFINER) e nas políticas de storage.objects,
-- que ficam no schema `storage` e não são tocadas por esta migration.

-- `anon` não recebe nada. A área do cliente (Etapa 10) vai precisar de um caminho
-- próprio, desenhado com as suas próprias políticas — não do default reaberto.

-- ---------------------------------------------------------------------------
-- 2. Funções
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

-- 2.1 — Auxiliares chamadas dentro das políticas RLS. Sem estas, toda consulta
--       autenticada falha com "permission denied for function".
grant execute on function public.is_active_business_member(uuid) to authenticated;
grant execute on function public.is_tenant_owner(uuid) to authenticated;
grant execute on function public.is_tenant_administrator(uuid) to authenticated;
grant execute on function public.is_tenant_scheduler(uuid) to authenticated;
grant execute on function public.is_current_user_professional(uuid, uuid) to authenticated;
grant execute on function public.is_automotive_business(uuid) to authenticated;
grant execute on function public.can_claim_initial_tenant_owner(uuid, uuid, public.business_role) to authenticated;
grant execute on function public.can_read_automotive_work_order_media_object(text) to authenticated;
grant execute on function public.can_manage_automotive_work_order_media_object(text) to authenticated;

-- 2.2 — Agenda
grant execute on function public.create_staff_appointment(uuid, uuid, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.reschedule_staff_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.transition_staff_appointment(uuid, public.appointment_status) to authenticated;
grant execute on function public.create_scheduling_block(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.remove_scheduling_block(uuid) to authenticated;

-- 2.3 — Operação automotiva
grant execute on function public.create_automotive_box(uuid, text, text, integer) to authenticated;
grant execute on function public.assign_automotive_appointment_box(uuid, uuid) to authenticated;
grant execute on function public.assign_automotive_work_order_box(uuid, uuid) to authenticated;
grant execute on function public.release_automotive_work_order_box(uuid) to authenticated;
grant execute on function public.open_automotive_work_order(
  uuid, uuid, uuid, uuid, uuid, timestamptz, integer, smallint, text, text, jsonb, text
) to authenticated;
grant execute on function public.open_automotive_walk_in_work_order(
  uuid, text, text, text, text, text, text, integer, integer, smallint, text, text
) to authenticated;
grant execute on function public.add_automotive_work_order_item(
  uuid, public.automotive_work_order_item_kind, text, numeric, numeric, uuid
) to authenticated;
grant execute on function public.remove_automotive_work_order_item(uuid) to authenticated;
grant execute on function public.record_automotive_work_order_payment(
  uuid, public.automotive_payment_kind, public.automotive_payment_method, numeric, timestamptz, text
) to authenticated;
grant execute on function public.transition_automotive_work_order(uuid, public.automotive_work_order_status) to authenticated;
grant execute on function public.deliver_automotive_work_order(uuid, timestamptz, text, text, jsonb) to authenticated;
grant execute on function public.register_automotive_work_order_media(
  uuid, public.automotive_media_stage, text, text
) to authenticated;
grant execute on function public.remove_automotive_work_order_media(uuid) to authenticated;

-- 2.4 — Fidelidade
grant execute on function public.save_automotive_loyalty_program(uuid, boolean, integer, integer, text) to authenticated;
grant execute on function public.redeem_automotive_loyalty_reward(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Impedir a recorrência
-- ---------------------------------------------------------------------------
-- Sem isto, a próxima tabela ou função criada volta a nascer exposta e o problema
-- reaparece silenciosamente. A partir daqui, abrir acesso é um ato explícito.

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- O teste supabase/tests/00_privilege_snapshot.sql passa a exigir exatamente esta
-- lista. Uma função nova nasce reprovada até ser conscientemente acrescentada lá.
