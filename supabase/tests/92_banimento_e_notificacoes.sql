-- Banimento e preferencias de notificacao.
--
-- Os tres repositorios do Barbershop que nao tinham schema: banimento, notificacao e
-- relatorio por e-mail. Estes sao os testes dos dois primeiros; o terceiro divide
-- tabela com o segundo.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('banimento', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.receptionist', t ->> 'receptionist_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Banir tem que IMPEDIR o agendamento
-- ---------------------------------------------------------------------------
-- Sem isto a tabela seria decorativa: a empresa marca "banido" e o sistema continua
-- aceitando o horario.

select tests.act_as(current_setting('tests.owner')::uuid);

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2027-07-06 13:00:00+00', null) $$,
  'control — antes do banimento o cliente agenda normalmente'
);

select lives_ok(
  $$ select public.ban_customer(current_setting('tests.customer')::uuid, 'nao compareceu tres vezes') $$,
  'control — o proprietario bane'
);

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2027-07-06 15:00:00+00', null) $$,
  '22023'::char(5),
  'Este cliente está impedido de agendar nesta empresa.',
  'cliente banido nao consegue mais agendar'
);

select isnt_empty(
  $$ select id from public.audit_log where action = 'ban' and entity = 'customer' $$,
  'banir deixa rastro na trilha'
);

select lives_ok(
  $$ select public.unban_customer(current_setting('tests.customer')::uuid) $$,
  'control — o banimento e reversivel'
);

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2027-07-06 16:00:00+00', null) $$,
  'desfeito o banimento, o cliente volta a agendar'
);

-- ---------------------------------------------------------------------------
-- Quem bane e quem enxerga o motivo
-- ---------------------------------------------------------------------------
-- O motivo e texto livre — o campo mais provavel de conter dado sensivel de verdade.

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

select throws_ok(
  $$ select public.ban_customer(current_setting('tests.customer')::uuid) $$,
  '42501'::char(5),
  'Only an administrator can ban a customer',
  'a recepcao nao bane'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

do $$
begin
  perform public.ban_customer(current_setting('tests.customer')::uuid, 'motivo privado');
end;
$$;

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

select isnt_empty(
  $$ select customer_id from public.customer_bans $$,
  'control — quem agenda VE o banimento, senao a recusa vira erro sem explicacao no balcao'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select customer_id from public.customer_bans $$,
  'o profissional nao le o motivo do banimento'
);

select ok(
  not has_table_privilege('authenticated', 'public.customer_bans', 'INSERT'),
  'nao se bane por escrita direta — so pela RPC, que audita'
);

-- ---------------------------------------------------------------------------
-- Preferencias de notificacao
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

-- Os padroes vem do Barbershop: whatsapp e push ligados, sms desligado, retorno em 30
-- dias, relatorio semanal sim e mensal nao.
select results_eq(
  $$ select canal_whatsapp, canal_push, canal_sms, retorno_ativo, retorno_dias,
            relatorio_semanal, relatorio_mensal
     from public.business_notification_settings
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  $$ values (true, true, false, false, 30, true, false) $$,
  'a empresa nasce com os padroes do Barbershop, sem a tela precisar tratar linha ausente'
);

select lives_ok(
  $$ update public.business_notification_settings
     set canal_sms = true, retorno_ativo = true, retorno_dias = 45
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  'control — a administracao ajusta as preferencias'
);

select throws_ok(
  $$ update public.business_notification_settings set retorno_dias = 2
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  '23514'::char(5),
  null::text,
  'lembrete de retorno em dois dias e recusado pelo schema'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select isnt_empty(
  $$ select tenant_id from public.business_notification_settings $$,
  'control — qualquer membro LE a preferencia'
);

select throws_ok(
  $$ update public.business_notification_settings set canal_sms = false
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  '42501'::char(5),
  null::text,
  'mas so a administracao ESCREVE'
);

select tests.clear_auth();

select * from finish();
rollback;
