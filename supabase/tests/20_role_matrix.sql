-- Role matrix.
--
-- Every RPC refuses an unauthorized role with SQLSTATE 42501 and a specific message.
-- These tests assert both, so a refusal caused by a missing GRANT (also 42501) is not
-- mistaken for a refusal caused by the role check.
--
-- Each negative is paired with the positive that proves the same call succeeds for the
-- role that is supposed to hold the permission.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('roles', 'automotive_aesthetics');
begin
  perform set_config('tests.tenant',       t ->> 'tenant_id',       true);
  perform set_config('tests.owner',        t ->> 'owner_id',        true);
  perform set_config('tests.manager',      t ->> 'manager_id',      true);
  perform set_config('tests.receptionist', t ->> 'receptionist_id', true);
  perform set_config('tests.technician',   t ->> 'technician_id',   true);
  perform set_config('tests.cashier',      t ->> 'cashier_id',      true);
  perform set_config('tests.outsider',     t ->> 'outsider_id',     true);
  perform set_config('tests.customer',     t ->> 'customer_id',     true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service',      t ->> 'service_id',      true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling — owner, manager and receptionist only
-- ---------------------------------------------------------------------------

select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-09-02 13:00:00+00'::timestamptz,
       null) $$,
  '42501'::char(5),
  'Only a scheduler can create appointments',
  'a technician cannot create an appointment'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-09-02 13:00:00+00'::timestamptz,
       null) $$,
  '42501'::char(5),
  'Only a scheduler can create appointments',
  'a cashier cannot create an appointment'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-09-02 13:00:00+00'::timestamptz,
       null) $$,
  'control — a receptionist can create an appointment'
);

-- ---------------------------------------------------------------------------
-- Automotive boxes and work orders — schedulers only
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.create_automotive_box(
       current_setting('tests.tenant')::uuid, 'B99', 'Box proibido') $$,
  '42501'::char(5),
  'Only a scheduler can create Automotive boxes',
  'a technician cannot create a box'
);

select throws_ok(
  $$ select public.open_automotive_walk_in_work_order(
       current_setting('tests.tenant')::uuid, 'TEC-1A11') $$,
  '42501'::char(5),
  'Only a scheduler can open an Automotive walk-in work order',
  'a technician cannot open a walk-in work order'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select throws_ok(
  $$ select public.open_automotive_walk_in_work_order(
       current_setting('tests.tenant')::uuid, 'CAI-2B22') $$,
  '42501'::char(5),
  'Only a scheduler can open an Automotive walk-in work order',
  'a cashier cannot open a walk-in work order'
);

-- ---------------------------------------------------------------------------
-- Payments — finance operators, which is the only place the cashier acts
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid,
    'PAY-3C33',
    'Cliente do pagamento'
  );

  -- Something to charge, so the cashier's positive control below stays valid once
  -- Etapa 2.3 starts refusing payments above the work-order total (C-9).
  perform public.add_automotive_work_order_item(
    v_work_order.id, 'service', 'Lavagem simples', 1, 50
  );

  perform set_config('tests.work_order', v_work_order.id::text, true);
end;
$$;

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.record_automotive_work_order_payment(
       current_setting('tests.work_order')::uuid,
       'payment'::public.automotive_payment_kind,
       'pix'::public.automotive_payment_method,
       10) $$,
  '42501'::char(5),
  'Only a finance operator can record payments',
  'a technician cannot record a payment'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select lives_ok(
  $$ select public.record_automotive_work_order_payment(
       current_setting('tests.work_order')::uuid,
       'payment'::public.automotive_payment_kind,
       'pix'::public.automotive_payment_method,
       10) $$,
  'control — a cashier can record a payment'
);

-- ---------------------------------------------------------------------------
-- Loyalty configuration — administrators only
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

select throws_ok(
  $$ select public.save_automotive_loyalty_program(
       current_setting('tests.tenant')::uuid, true, 1, 10, 'Lavagem gratis') $$,
  '42501'::char(5),
  'Only an administrator can configure Automotive loyalty',
  'a receptionist cannot configure the loyalty program'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.manager')::uuid);

select lives_ok(
  $$ select public.save_automotive_loyalty_program(
       current_setting('tests.tenant')::uuid, true, 1, 10, 'Lavagem gratis') $$,
  'control — a manager can configure the loyalty program'
);

-- ---------------------------------------------------------------------------
-- A user with no membership holds no permission at all
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.outsider')::uuid);

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-09-03 13:00:00+00'::timestamptz,
       null) $$,
  '42501'::char(5),
  'Only a scheduler can create appointments',
  'a user outside the tenant cannot schedule in it'
);

select throws_ok(
  $$ select public.open_automotive_walk_in_work_order(
       current_setting('tests.tenant')::uuid, 'OUT-4D44') $$,
  '42501'::char(5),
  'Only a scheduler can open an Automotive walk-in work order',
  'a user outside the tenant cannot open a work order in it'
);

-- ---------------------------------------------------------------------------
-- A empresa nao pode ficar sem proprietario ativo (C-20)
-- ---------------------------------------------------------------------------
-- O gatilho e DEFERRABLE INITIALLY DEFERRED: so dispara no commit. Como o arquivo
-- inteiro roda numa transacao que termina em rollback, cada caso forca a
-- verificacao com `set constraints all immediate` no mesmo bloco.

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select throws_ok(
  $$ delete from public.business_members
     where tenant_id = current_setting('tests.tenant')::uuid
       and role = 'owner';
     set constraints all immediate; $$,
  '22023'::char(5),
  'A empresa precisa manter ao menos um proprietário ativo',
  'o unico proprietario nao pode remover a si mesmo'
);

select throws_ok(
  $$ update public.business_members set role = 'manager'
     where tenant_id = current_setting('tests.tenant')::uuid
       and role = 'owner';
     set constraints all immediate; $$,
  '22023'::char(5),
  'A empresa precisa manter ao menos um proprietário ativo',
  'o unico proprietario nao pode rebaixar a si mesmo'
);

select throws_ok(
  $$ update public.business_members set active = false
     where tenant_id = current_setting('tests.tenant')::uuid
       and role = 'owner';
     set constraints all immediate; $$,
  '22023'::char(5),
  'A empresa precisa manter ao menos um proprietário ativo',
  'o unico proprietario nao pode se desativar'
);

-- O controle positivo: a troca de dono numa unica transacao continua funcionando.
-- E por isso que a verificacao e diferida, e nao linha a linha.
select lives_ok(
  $$ update public.business_members set role = 'owner'
       where tenant_id = current_setting('tests.tenant')::uuid
         and user_id = current_setting('tests.manager')::uuid;
     update public.business_members set role = 'manager'
       where tenant_id = current_setting('tests.tenant')::uuid
         and user_id = current_setting('tests.owner')::uuid;
     set constraints all immediate; $$,
  'control — a troca de dono numa unica transacao e permitida'
);

select tests.clear_auth();

select * from finish();
rollback;
