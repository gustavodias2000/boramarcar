-- Etapa 4 — configuração de agenda completa.
--
-- Cada recurso é testado nos dois sentidos: recusa quando deve recusar, e o controle
-- positivo mostrando que o mesmo agendamento passa sem a restrição.
--
-- A fixture cria disponibilidade das 06:00 às 22:00 em todos os dias, então qualquer
-- recusa aqui vem da configuração, não da janela recorrente.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('agenda-config', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- Sem linha de configuração, nada muda
-- ---------------------------------------------------------------------------
-- É o que garante que a migration não altera o comportamento de quem já usava.

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-10-07 13:00:00+00'::timestamptz, null) $$,
  'control — sem configuracao o agendamento se comporta como antes'
);

-- ---------------------------------------------------------------------------
-- Intervalo de almoco
-- ---------------------------------------------------------------------------

insert into public.professional_schedule_settings (tenant_id, professional_id, lunch_starts_at, lunch_ends_at)
values (
  current_setting('tests.tenant')::uuid,
  current_setting('tests.professional')::uuid,
  '12:00',
  '13:00'
);

-- 15:00Z = 12:00 em Sao Paulo: cai dentro do almoco.
select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-10-08 15:00:00+00'::timestamptz, null) $$,
  'P0001'::char(5),
  'Este horário cai no intervalo de almoço do profissional.',
  'o agendamento dentro do almoco e recusado'
);

-- 17:00Z = 14:00 local: depois do almoco.
select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-10-08 17:00:00+00'::timestamptz, null) $$,
  'control — fora do almoco o mesmo dia aceita'
);

-- ---------------------------------------------------------------------------
-- Antecedencia minima e maxima
-- ---------------------------------------------------------------------------

update public.professional_schedule_settings
set lunch_starts_at = null,
    lunch_ends_at = null,
    min_notice_minutes = 120,
    max_advance_days = 30
where tenant_id = current_setting('tests.tenant')::uuid;

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       now() + interval '10 minutes', null) $$,
  '22023'::char(5),
  null::text,
  'agendar para daqui a dez minutos e recusado pela antecedencia minima'
);

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       now() + interval '200 days', null) $$,
  '22023'::char(5),
  null::text,
  'agendar para daqui a duzentos dias e recusado pela antecedencia maxima'
);

-- ---------------------------------------------------------------------------
-- Buffer entre atendimentos
-- ---------------------------------------------------------------------------
-- O servico da fixture dura 60 minutos. Com buffer de 30, o proximo so pode comecar
-- 90 minutos depois do inicio do anterior.

update public.professional_schedule_settings
set min_notice_minutes = 0,
    max_advance_days = 0,
    buffer_after_minutes = 30
where tenant_id = current_setting('tests.tenant')::uuid;

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-11-04 13:00:00+00'::timestamptz, null) $$,
  'control — o primeiro agendamento do dia e aceito'
);

-- Encostado no fim do anterior: dentro do buffer.
select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-11-04 14:00:00+00'::timestamptz, null) $$,
  'P0001'::char(5),
  null::text,
  'o agendamento colado no anterior e recusado pelo buffer'
);

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-11-04 14:30:00+00'::timestamptz, null) $$,
  'control — passado o buffer, o horario seguinte e aceito'
);

-- ---------------------------------------------------------------------------
-- Turno extra
-- ---------------------------------------------------------------------------
-- A janela recorrente da fixture vai ate as 22:00 locais. O turno extra abre um
-- segundo bloco a noite, fora dela.

update public.professional_schedule_settings
set buffer_after_minutes = 0
where tenant_id = current_setting('tests.tenant')::uuid;

-- 01:00Z = 22:00 do dia anterior em Sao Paulo: fora da janela recorrente.
select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-11-06 01:00:00+00'::timestamptz, null) $$,
  'P0001'::char(5),
  'Professional is unavailable for the requested interval',
  'fora da janela recorrente o agendamento e recusado'
);

update public.professional_schedule_settings
set extra_shift_active = true,
    extra_shift_starts_at = '22:00',
    extra_shift_ends_at = '23:30'
where tenant_id = current_setting('tests.tenant')::uuid;

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-11-06 01:00:00+00'::timestamptz, null) $$,
  'o turno extra abre o mesmo horario que a janela recorrente recusava'
);

-- ---------------------------------------------------------------------------
-- Isolamento e papel
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select is_empty(
  $$ select id from public.professional_schedule_settings
     where tenant_id <> current_setting('tests.tenant')::uuid $$,
  'a configuracao de outro tenant nao e visivel'
);

select tests.clear_auth();
select tests.act_as_anon();

-- ANON NAO CHEGA A CONSULTAR — e essa e a barreira mais forte, nao a mais fraca.
--
-- Estas asercoes nasceram antes da Etapa 1. Naquele momento `anon` tinha os grants
-- padrao do Supabase e a RLS e que filtrava as linhas, entao `is_empty` era a leitura
-- certa. A `20260825000200_harden_privileges.sql` revogou TODOS os grants de `anon`, de
-- proposito: nao ha superficie publica ainda, e ate existir ele nao tem por que
-- alcancar objeto nenhum.
--
-- Consequencia: a consulta morre com 42501 ANTES de a politica ser avaliada. Afirmar
-- `is_empty` agora seria afirmar o mecanismo fraco quando o forte esta em vigor.

select throws_ok(
  $$ select id from public.professional_schedule_settings $$,
  '42501'::char(5),
  null::text,
  'anon nao alcanca configuracao de agenda — recusado por privilegio'
);

select tests.clear_auth();

select * from finish();
rollback;
