-- Etapa 4 — motivo privado de bloqueio e avaliação de atendimento.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('nucleo', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.manager', t ->> 'manager_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.cashier', t ->> 'cashier_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);

  perform set_config(
    'tests.resource',
    (select resource.id::text
     from public.scheduling_resources resource
     where resource.tenant_id = tests.id(t, 'tenant_id')
       and resource.professional_id = tests.id(t, 'professional_id')),
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Motivo do bloqueio e dado pessoal
-- ---------------------------------------------------------------------------

select tests.act_as(current_setting('tests.owner')::uuid);

do $$
begin
  perform set_config(
    'tests.block',
    public.create_scheduling_block(
      current_setting('tests.resource')::uuid,
      '2026-12-02 13:00:00+00',
      '2026-12-02 15:00:00+00',
      'Consulta médica'
    )::text,
    true
  );
end;
$$;

-- O intervalo continua operacional e público para a equipe: é o que permite montar a
-- grade de disponibilidade sem revelar nada de pessoal.
select results_eq(
  $$ select kind::text, reason
     from public.scheduling_resource_reservations
     where id = current_setting('tests.block')::uuid $$,
  $$ values ('block'::text, 'manual_block'::text) $$,
  'o intervalo publico guarda apenas o marcador de origem, nao o texto'
);

select results_eq(
  $$ select note from public.scheduling_block_notes
     where reservation_id = current_setting('tests.block')::uuid $$,
  $$ values ('Consulta médica'::text) $$,
  'control — quem agenda le o motivo'
);

-- O caixa é membro ativo: vê o bloqueio, não vê o motivo.
select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select isnt_empty(
  $$ select id from public.scheduling_resource_reservations
     where id = current_setting('tests.block')::uuid $$,
  'control — o caixa enxerga que o horario esta bloqueado'
);

select is_empty(
  $$ select note from public.scheduling_block_notes
     where reservation_id = current_setting('tests.block')::uuid $$,
  'o caixa NAO le o motivo do bloqueio de um colega'
);

-- O profissional dono do recurso lê o próprio motivo.
select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select isnt_empty(
  $$ select note from public.scheduling_block_notes
     where reservation_id = current_setting('tests.block')::uuid $$,
  'control — o profissional le o motivo do proprio bloqueio'
);

select tests.clear_auth();
select tests.act_as_anon();

select is_empty(
  $$ select note from public.scheduling_block_notes $$,
  'anon nao le motivo de bloqueio'
);

-- ---------------------------------------------------------------------------
-- Avaliacao de atendimento
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

do $$
declare
  v_appointment public.appointments;
begin
  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    '2026-12-03 13:00:00+00',
    'Atendimento para avaliar'
  );

  perform set_config('tests.appointment', v_appointment.id::text, true);
end;
$$;

-- Ainda não concluído: não há o que avaliar.
select throws_ok(
  $$ select public.record_appointment_rating(
       current_setting('tests.appointment')::uuid, 5::smallint, 'Otimo') $$,
  '22023'::char(5),
  'Somente um atendimento concluído pode ser avaliado.',
  'atendimento nao concluido nao pode ser avaliado'
);

do $$
begin
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'confirmed');
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'in_progress');
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'completed');
end;
$$;

select throws_ok(
  $$ select public.record_appointment_rating(
       current_setting('tests.appointment')::uuid, 9::smallint, null) $$,
  '22023'::char(5),
  'A nota deve estar entre 1 e 5.',
  'nota fora da escala e recusada'
);

select lives_ok(
  $$ select public.record_appointment_rating(
       current_setting('tests.appointment')::uuid, 5::smallint, 'Atendimento impecavel') $$,
  'control — o atendimento concluido pode ser avaliado'
);

-- Cliente e profissional vêm do agendamento: quem avalia não escolhe quem foi avaliado.
select results_eq(
  $$ select customer_id, professional_id, rating
     from public.appointment_ratings
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  $$ select current_setting('tests.customer')::uuid,
            current_setting('tests.professional')::uuid,
            5::smallint $$,
  'a avaliacao copia cliente e profissional do proprio agendamento'
);

-- Reavaliar é editar, não acumular.
select lives_ok(
  $$ select public.record_appointment_rating(
       current_setting('tests.appointment')::uuid, 3::smallint, 'Revisado') $$,
  'reavaliar o mesmo atendimento e permitido'
);

select results_eq(
  $$ select count(*)::int, max(rating)
     from public.appointment_ratings
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  $$ values (1, 3::smallint) $$,
  'reavaliar substitui em vez de acumular'
);

-- Papel: o técnico não registra avaliação.
select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.record_appointment_rating(
       current_setting('tests.appointment')::uuid, 1::smallint, null) $$,
  '42501'::char(5),
  'Only a scheduler can record a rating',
  'o tecnico nao registra avaliacao'
);

select tests.clear_auth();

select * from finish();
rollback;
