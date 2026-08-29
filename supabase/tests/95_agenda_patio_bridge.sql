-- Etapa 6 — a ponte entre Agenda e Pátio.
--
-- Cobre as funções que fechavam o buraco entre os dois sistemas: atribuir responsável
-- e box à OS, editar e desativar box, e a disponibilidade recorrente que deixou de ser
-- escrita direta na tabela.

begin;
select * from no_plan();

do $$
declare
  a jsonb := tests.build_tenant('ponte-a', 'automotive_aesthetics');
  b jsonb := tests.build_tenant('ponte-b', 'automotive_aesthetics');
begin
  perform set_config('tests.tenant', a ->> 'tenant_id', true);
  perform set_config('tests.owner', a ->> 'owner_id', true);
  perform set_config('tests.technician', a ->> 'technician_id', true);
  perform set_config('tests.cashier', a ->> 'cashier_id', true);
  perform set_config('tests.customer', a ->> 'customer_id', true);
  perform set_config('tests.professional', a ->> 'professional_id', true);
  perform set_config('tests.service', a ->> 'service_id', true);

  -- Profissional de OUTRA empresa, para provar que atribuir cruzando tenant e recusado.
  perform set_config('tests.professional_b', b ->> 'professional_id', true);
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid, 'PON-1A11', 'Cliente da ponte'
  );

  perform set_config('tests.work_order', v_work_order.id::text, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Atribuir o tecnico responsavel
-- ---------------------------------------------------------------------------
-- Era o buraco mais grave: toda OS de entrada rapida nascia sem responsavel, e a
-- politica de midia e a transicao por tecnico dependem desse campo.

select is_empty(
  $$ select id from public.automotive_work_orders
     where id = current_setting('tests.work_order')::uuid
       and assigned_professional_id is not null $$,
  'a OS de entrada rapida nasce sem responsavel'
);

select lives_ok(
  $$ select public.assign_automotive_work_order_professional(
       current_setting('tests.work_order')::uuid,
       current_setting('tests.professional')::uuid) $$,
  'control — o responsavel pode ser atribuido'
);

select results_eq(
  $$ select assigned_professional_id from public.automotive_work_orders
     where id = current_setting('tests.work_order')::uuid $$,
  $$ select current_setting('tests.professional')::uuid $$,
  'a OS passa a ter responsavel'
);

select isnt_empty(
  $$ select id from public.automotive_work_order_events
     where work_order_id = current_setting('tests.work_order')::uuid
       and event_type = 'professional_assigned' $$,
  'a atribuicao entra na linha do tempo da OS'
);

-- Desatribuir e legitimo: o carro volta para a fila sem dono.
select lives_ok(
  $$ select public.assign_automotive_work_order_professional(
       current_setting('tests.work_order')::uuid, null) $$,
  'o responsavel pode ser removido'
);

select throws_ok(
  $$ select public.assign_automotive_work_order_professional(
       current_setting('tests.work_order')::uuid,
       current_setting('tests.professional_b')::uuid) $$,
  'P0001'::char(5),
  'Profissional ativo não encontrado nesta empresa.',
  'profissional de outra empresa nao pode ser atribuido'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select throws_ok(
  $$ select public.assign_automotive_work_order_professional(
       current_setting('tests.work_order')::uuid,
       current_setting('tests.professional')::uuid) $$,
  '42501'::char(5),
  'Only a scheduler can assign the work-order professional',
  'o caixa nao atribui responsavel'
);

-- ---------------------------------------------------------------------------
-- Editar e desativar box
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

do $$
declare
  v_box public.automotive_boxes;
begin
  select * into v_box
  from public.create_automotive_box(current_setting('tests.tenant')::uuid, 'B01', 'Box um');
  perform set_config('tests.box', v_box.id::text, true);
  perform set_config('tests.box_resource', v_box.scheduling_resource_id::text, true);
end;
$$;

select lives_ok(
  $$ select public.update_automotive_box(
       current_setting('tests.box')::uuid, 'B07', 'Box de polimento') $$,
  'control — o box pode ser renomeado'
);

select results_eq(
  $$ select code, name from public.automotive_boxes
     where id = current_setting('tests.box')::uuid $$,
  $$ values ('B07'::text, 'Box de polimento'::text) $$,
  'o box guarda o novo codigo e nome'
);

-- O recurso de agenda acompanha: senao a grade mostraria o nome antigo.
select results_eq(
  $$ select name from public.scheduling_resources
     where id = current_setting('tests.box_resource')::uuid $$,
  $$ values ('Box de polimento'::text) $$,
  'o recurso de agenda acompanha o nome do box'
);

-- Desativar box com carro dentro esconderia uma ocupacao real.
do $$
begin
  perform public.assign_automotive_work_order_box(
    current_setting('tests.work_order')::uuid,
    current_setting('tests.box')::uuid
  );
end;
$$;

select throws_ok(
  $$ select public.update_automotive_box(current_setting('tests.box')::uuid, null, null, null, false) $$,
  '22023'::char(5),
  'Este box está ocupado por uma ordem de serviço ativa.',
  'box ocupado nao pode ser desativado'
);

select lives_ok(
  $$ select public.release_automotive_work_order_box(current_setting('tests.work_order')::uuid) $$,
  'control — o box pode ser liberado'
);

select lives_ok(
  $$ select public.update_automotive_box(current_setting('tests.box')::uuid, null, null, null, false) $$,
  'box livre pode ser desativado'
);

select results_eq(
  $$ select active from public.scheduling_resources
     where id = current_setting('tests.box_resource')::uuid $$,
  $$ values (false) $$,
  'o recurso de agenda tambem e desativado — box inativo nao e reservavel'
);

-- ---------------------------------------------------------------------------
-- Disponibilidade recorrente por RPC
-- ---------------------------------------------------------------------------
-- A escrita direta na tabela era a ultima do produto. Com RPC, o grant caiu para
-- SELECT — e a checagem de papel deixou de depender so da politica.

select is_empty(
  $$ select p.priv
     from (values ('INSERT'),('UPDATE'),('DELETE')) as p(priv)
     where has_table_privilege('authenticated', 'public.professional_schedule_rules', p.priv) $$,
  'authenticated nao escreve direto na disponibilidade recorrente'
);

select lives_ok(
  $$ select public.set_professional_schedule_rule(
       current_setting('tests.professional')::uuid, 1::smallint, '23:00', '23:30') $$,
  'control — quem agenda define disponibilidade'
);

select throws_ok(
  $$ select public.set_professional_schedule_rule(
       current_setting('tests.professional')::uuid, 1::smallint, '10:00', '09:00') $$,
  '22023'::char(5),
  'O intervalo de disponibilidade precisa ter duração positiva.',
  'intervalo invertido e recusado'
);

-- O proprio profissional ajusta o proprio horario, mesmo sem ser scheduler.
select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select lives_ok(
  $$ select public.set_professional_schedule_rule(
       current_setting('tests.professional')::uuid, 2::smallint, '23:00', '23:30') $$,
  'control — o profissional ajusta a propria disponibilidade'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select throws_ok(
  $$ select public.set_professional_schedule_rule(
       current_setting('tests.professional')::uuid, 3::smallint, '23:00', '23:30') $$,
  '42501'::char(5),
  'Você não pode alterar a disponibilidade deste profissional.',
  'o caixa nao mexe na disponibilidade de ninguem'
);

select tests.clear_auth();

select * from finish();
rollback;
