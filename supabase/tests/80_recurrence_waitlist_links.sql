-- Etapa 4 — recorrência, lista de espera e vínculo cliente ↔ empresa.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('nucleo2', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.outsider', t ->> 'outsider_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- Recorrencia
-- ---------------------------------------------------------------------------
-- 2026-12-02 e uma quarta-feira (dow = 3).

do $$
begin
  insert into public.appointment_recurrences (
    tenant_id, customer_id, service_id, professional_id, weekday, starts_at, frequency, created_by
  )
  values (
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    3,
    '10:00',
    'weekly',
    current_setting('tests.owner')::uuid
  );

  perform set_config(
    'tests.recurrence',
    (select id::text from public.appointment_recurrences
     where tenant_id = current_setting('tests.tenant')::uuid)::text,
    true
  );
end;
$$;

-- Segunda-feira nao bate com a quarta da regra.
select throws_ok(
  $$ select public.generate_recurrence_appointment(
       current_setting('tests.recurrence')::uuid, date '2026-11-30') $$,
  '22023'::char(5),
  'A data não corresponde ao dia da semana da recorrência.',
  'gerar em dia da semana diferente e recusado'
);

select lives_ok(
  $$ select public.generate_recurrence_appointment(
       current_setting('tests.recurrence')::uuid, date '2026-12-02') $$,
  'control — a recorrencia gera o agendamento no dia certo'
);

select results_eq(
  $$ select last_generated_on from public.appointment_recurrences
     where id = current_setting('tests.recurrence')::uuid $$,
  $$ values (date '2026-12-02') $$,
  'a recorrencia registra a ultima data gerada'
);

-- Guarda de cadencia: a quarta seguinte da semana ja gerada.
select throws_ok(
  $$ select public.generate_recurrence_appointment(
       current_setting('tests.recurrence')::uuid, date '2026-12-02') $$,
  '22023'::char(5),
  null::text,
  'gerar o mesmo ciclo duas vezes e recusado'
);

select lives_ok(
  $$ select public.generate_recurrence_appointment(
       current_setting('tests.recurrence')::uuid, date '2026-12-09') $$,
  'control — o ciclo seguinte e aceito'
);

-- ---------------------------------------------------------------------------
-- Lista de espera
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.appointment_waitlist (
    tenant_id, customer_id, service_id, professional_id, desired_date, created_by
  )
  values (
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    date '2026-12-16',
    current_setting('tests.owner')::uuid
  );

  perform set_config(
    'tests.waitlist',
    (select id::text from public.appointment_waitlist
     where tenant_id = current_setting('tests.tenant')::uuid)::text,
    true
  );
end;
$$;

select lives_ok(
  $$ select public.mark_waitlist_notified(current_setting('tests.waitlist')::uuid) $$,
  'control — a espera pode ser marcada como notificada'
);

-- Avisar nao e confirmar: notificar de novo nao faz sentido.
select throws_ok(
  $$ select public.mark_waitlist_notified(current_setting('tests.waitlist')::uuid) $$,
  '22023'::char(5),
  'Somente uma espera aguardando pode ser marcada como notificada.',
  'notificar duas vezes a mesma espera e recusado'
);

select lives_ok(
  $$ select public.schedule_from_waitlist(
       current_setting('tests.waitlist')::uuid,
       '2026-12-16 13:00:00+00'::timestamptz) $$,
  'a espera vira agendamento'
);

select results_eq(
  $$ select status::text, (appointment_id is not null)
     from public.appointment_waitlist
     where id = current_setting('tests.waitlist')::uuid $$,
  $$ values ('scheduled'::text, true) $$,
  'a espera resolvida guarda o agendamento que a atendeu'
);

select throws_ok(
  $$ select public.schedule_from_waitlist(
       current_setting('tests.waitlist')::uuid,
       '2026-12-16 15:00:00+00'::timestamptz) $$,
  '22023'::char(5),
  'Esta espera já foi resolvida.',
  'uma espera resolvida nao vira agendamento de novo'
);

-- ---------------------------------------------------------------------------
-- Convite e vinculo
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.business_invitations (tenant_id, code, professional_id, created_by)
  values (
    current_setting('tests.tenant')::uuid,
    'NUCLEO2024',
    current_setting('tests.professional')::uuid,
    current_setting('tests.owner')::uuid
  );
end;
$$;

-- O resgate e feito por quem NAO e membro da empresa: e o cliente final.
select tests.clear_auth();
select tests.act_as(current_setting('tests.outsider')::uuid);

select throws_ok(
  $$ select public.redeem_business_invitation('NAOEXISTE1') $$,
  'P0001'::char(5),
  'Convite inválido ou expirado.',
  'codigo inexistente e recusado'
);

do $$
declare
  v_link public.customer_links;
begin
  select * into v_link from public.redeem_business_invitation('NUCLEO2024', 'Cliente Final');
  perform set_config('tests.link', v_link.id::text, true);
  perform set_config('tests.link_customer', v_link.customer_id::text, true);
end;
$$;

select results_eq(
  $$ select origin::text, (invited_by_professional_id is not null)
     from public.customer_links where id = current_setting('tests.link')::uuid $$,
  $$ values ('invite'::text, true) $$,
  'o vinculo registra a origem e o profissional que originou'
);

-- Determinismo: resgatar de novo devolve o mesmo vinculo, nao cria um segundo cadastro.
do $$
declare
  v_link public.customer_links;
begin
  select * into v_link from public.redeem_business_invitation('NUCLEO2024');
  perform set_config('tests.link2', v_link.id::text, true);
end;
$$;

select is(
  current_setting('tests.link2'),
  current_setting('tests.link'),
  'resgatar o mesmo convite duas vezes devolve o mesmo vinculo'
);

select results_eq(
  $$ select count(*)::int from public.customer_links
     where user_id = current_setting('tests.outsider')::uuid $$,
  $$ values (1) $$,
  'nao existe vinculo duplicado para o mesmo usuario'
);

-- O cliente final enxerga o proprio vinculo mesmo sem ser membro da empresa. E o
-- caminho que a area do cliente vai usar.
select isnt_empty(
  $$ select id from public.customer_links
     where user_id = current_setting('tests.outsider')::uuid $$,
  'o cliente vinculado le o proprio vinculo sem ser membro'
);

-- Mas continua sem enxergar a operacao da empresa.
select is_empty(
  $$ select id from public.appointments $$,
  'o cliente vinculado NAO enxerga a agenda da empresa'
);

-- E ainda NAO enxerga nem o proprio cadastro de cliente: `customers_select_member`
-- exige vinculo em business_members, que o consumidor final nunca tera. Fechar essa
-- porta com uma politica propria e trabalho da Etapa 10 — o vinculo acima e a chave
-- que ela vai usar.
select is_empty(
  $$ select id from public.customers $$,
  'o cliente vinculado ainda nao le cadastro de cliente — porta da Etapa 10'
);

select tests.clear_auth();

select * from finish();
rollback;
