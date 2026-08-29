-- Etapa 7 — manicure, salão e maquiagem.
--
-- A TESE QUE ESTE ARQUIVO TESTA
--
-- Se as etapas anteriores foram bem feitas, uma categoria nova custa configuração, não
-- desenvolvimento. Nenhuma linha de SQL ou de código foi escrita para manicure, salão
-- ou maquiagem — elas usam exatamente as mesmas funções da barbearia e da automotiva.
--
-- O teste vai além de "abre sem erro": leva cada categoria pelo ciclo inteiro da
-- agenda e verifica que NADA de automotivo vazou para dentro dela.

begin;
select * from no_plan();

do $$
begin
  perform set_config('tests.dono', tests.create_user('tres-categorias@example.invalid')::text, true);
end;
$$;

select tests.act_as(current_setting('tests.dono')::uuid);

-- ---------------------------------------------------------------------------
-- As tres categorias abrem pela mesma porta
-- ---------------------------------------------------------------------------

do $$
declare
  v_business public.businesses;
begin
  select * into v_business from public.create_business_with_owner('Estudio de Unhas', 'manicure');
  perform set_config('tests.manicure', v_business.id::text, true);

  select * into v_business from public.create_business_with_owner('Salao Aurora', 'beauty_salon');
  perform set_config('tests.salao', v_business.id::text, true);

  select * into v_business from public.create_business_with_owner('Studio Make', 'makeup');
  perform set_config('tests.maquiagem', v_business.id::text, true);
end;
$$;

select results_eq(
  $$ select count(*)::int from public.businesses
     where business_type in ('manicure', 'beauty_salon', 'makeup') $$,
  $$ values (3) $$,
  'as tres categorias novas abrem pela mesma funcao'
);

-- Cada uma com o proprio catalogo, sem mistura.
select results_eq(
  $$ select count(*)::int from public.services
     where tenant_id = current_setting('tests.manicure')::uuid $$,
  $$ select count(*)::int from public.segment_default_services where business_type = 'manicure' $$,
  'a manicure recebe o catalogo de manicure'
);

select isnt_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.maquiagem')::uuid
       and name = 'Maquiagem para noiva' $$,
  'a maquiagem recebe servicos de maquiagem'
);

select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.salao')::uuid
       and name in ('Vitrificação', 'Alongamento em fibra', 'Corte de cabelo') $$,
  'o salao nao recebe servico de automotiva, manicure nem barbearia'
);

-- ---------------------------------------------------------------------------
-- A empresa nasce PODENDO agendar
-- ---------------------------------------------------------------------------
-- Este bloco existe por causa de um bloqueio que so apareceu aqui: ate a Etapa 7, a
-- empresa nascia com servicos e sem profissional, e a agenda recusava tudo.

select results_eq(
  $$ select count(*)::int from public.professionals
     where tenant_id = current_setting('tests.manicure')::uuid and active $$,
  $$ values (1) $$,
  'o dono vira o primeiro profissional da unidade'
);

select results_eq(
  $$ select count(*)::int from public.professional_schedule_rules
     where tenant_id = current_setting('tests.manicure')::uuid $$,
  $$ values (6) $$,
  'a disponibilidade padrao cobre segunda a sabado'
);

select isnt_empty(
  $$ select id from public.scheduling_resources
     where tenant_id = current_setting('tests.manicure')::uuid and kind = 'professional' $$,
  'o recurso de agenda do profissional e criado pelo gatilho'
);

-- ---------------------------------------------------------------------------
-- Ciclo completo da agenda numa manicure
-- ---------------------------------------------------------------------------

do $$
declare
  v_customer uuid;
  v_appointment public.appointments;
begin
  insert into public.customers (tenant_id, name, created_by)
  values (current_setting('tests.manicure')::uuid, 'Cliente da manicure',
          current_setting('tests.dono')::uuid)
  returning id into v_customer;

  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.manicure')::uuid,
    v_customer,
    (select id from public.services
     where tenant_id = current_setting('tests.manicure')::uuid and name = 'Manicure'),
    (select id from public.professionals
     where tenant_id = current_setting('tests.manicure')::uuid),
    '2026-12-02 13:00:00+00',   -- quarta, 10h em Sao Paulo
    null
  );

  perform set_config('tests.appointment', v_appointment.id::text, true);
  perform set_config('tests.cliente_manicure', v_customer::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.appointments
     where id = current_setting('tests.appointment')::uuid $$,
  'a manicure agenda no primeiro minuto, sem cadastro adicional'
);

select isnt_empty(
  $$ select id from public.scheduling_resource_reservations
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  'o agendamento reserva a capacidade do profissional'
);

-- O conflito de horario vale igual: a regra e do nucleo, nao da categoria.
select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.manicure')::uuid,
       current_setting('tests.cliente_manicure')::uuid,
       (select id from public.services
        where tenant_id = current_setting('tests.manicure')::uuid and name = 'Pedicure'),
       (select id from public.professionals
        where tenant_id = current_setting('tests.manicure')::uuid),
       '2026-12-02 13:30:00+00'::timestamptz, null) $$,
  '23P01'::char(5),
  null::text,
  'conflito de horario e recusado tambem na manicure'
);

-- Concluir e avaliar: o ciclo do nucleo inteiro.
do $$
begin
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'confirmed');
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'in_progress');
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'completed');
  perform public.record_appointment_rating(current_setting('tests.appointment')::uuid, 5::smallint, 'Otimo');
end;
$$;

select results_eq(
  $$ select rating from public.appointment_ratings
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  $$ values (5::smallint) $$,
  'avaliacao funciona na manicure sem nenhum codigo especifico'
);

-- ---------------------------------------------------------------------------
-- Nada de automotivo vazou
-- ---------------------------------------------------------------------------
-- A prova negativa. Se alguma tabela de modulo tivesse sido preenchida para estas
-- categorias, a fronteira nucleo × modulo estaria furada.

select is_empty(
  $$ select id from public.automotive_vehicles
     where tenant_id in (
       current_setting('tests.manicure')::uuid,
       current_setting('tests.salao')::uuid,
       current_setting('tests.maquiagem')::uuid) $$,
  'nenhum veiculo foi criado para as categorias novas'
);

select is_empty(
  $$ select id from public.automotive_boxes
     where tenant_id in (
       current_setting('tests.manicure')::uuid,
       current_setting('tests.salao')::uuid,
       current_setting('tests.maquiagem')::uuid) $$,
  'nenhum box foi criado para as categorias novas'
);

select is_empty(
  $$ select id from public.automotive_work_orders
     where tenant_id in (
       current_setting('tests.manicure')::uuid,
       current_setting('tests.salao')::uuid,
       current_setting('tests.maquiagem')::uuid) $$,
  'nenhuma ordem de servico foi criada para as categorias novas'
);

-- E o banco recusa criar um box numa manicure: a checagem de categoria e do servidor,
-- nao apenas do menu que esconde a tela.
select throws_ok(
  $$ select public.create_automotive_box(
       current_setting('tests.manicure')::uuid, 'B01', 'Box indevido') $$,
  '22023'::char(5),
  'This operation requires an active Automotive business',
  'o banco recusa box em categoria sem operacao automotiva'
);

select throws_ok(
  $$ select public.open_automotive_walk_in_work_order(
       current_setting('tests.salao')::uuid, 'SAL-1A11') $$,
  '22023'::char(5),
  'This operation requires an active Automotive business',
  'o banco recusa entrada de veiculo num salao'
);

-- ---------------------------------------------------------------------------
-- Isolamento entre as tres
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.salao')::uuid
       and id in (select id from public.services
                  where tenant_id = current_setting('tests.manicure')::uuid) $$,
  'os catalogos das tres empresas sao independentes'
);

select tests.clear_auth();

select * from finish();
rollback;
