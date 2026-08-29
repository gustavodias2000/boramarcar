-- Etapa 2 — operation defects, now fixed and locked.
--
-- These started as todo_start/todo_end blocks describing the behaviour the system
-- SHOULD have while it still had the bug. Etapa 2 fixed the causes and the wrappers
-- came off, so every assertion here is binding:
--
--   C-5   migration 20260825000600 — box reserved for a bounded interval
--   C-6   migration 20260825000500 — opening a work order consumes the appointment
--   C-9   migration 20260825000400 — payments validated against the work-order total
--   C-13  migration 20260825000500 — one active work order per vehicle
--   C-14  migration 20260825000400 — an itemless work order is 'unbilled', not 'paid'
--
-- The file keeps its name: it is the regression suite for the defects the audit found.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('defects', 'automotive_aesthetics');
begin
  perform set_config('tests.tenant',       t ->> 'tenant_id',       true);
  perform set_config('tests.owner',        t ->> 'owner_id',        true);
  perform set_config('tests.customer',     t ->> 'customer_id',     true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service',      t ->> 'service_id',      true);

  perform set_config(
    'tests.vehicle',
    tests.create_vehicle(
      tests.id(t, 'tenant_id'),
      tests.id(t, 'customer_id'),
      'DEF-1A11',
      tests.id(t, 'owner_id')
    )::text,
    true
  );
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- C-14 — a work order with no items is not a paid work order
-- ---------------------------------------------------------------------------
-- `payment_status` collapses "nothing to charge yet" into 'paid', so every walk-in
-- enters the Patio marked as settled — exactly when the desk most needs to see that
-- it still has to be billed.

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid, 'C14-2B22', 'Cliente C14'
  );

  perform set_config('tests.wo_empty', v_work_order.id::text, true);
end;
$$;

select isnt(
  (select payment_status::text from public.automotive_patio
   where id = current_setting('tests.wo_empty')::uuid),
  'paid',
  'a work order with no items is not reported as paid'
);

-- ---------------------------------------------------------------------------
-- C-13 — one active work order per vehicle
-- ---------------------------------------------------------------------------
-- Reusing the customer and the vehicle for a returning plate is correct and is
-- asserted in 40_. Opening a SECOND work order while the first is still active is
-- not: the same car shows twice in the Patio, with two numbers and two invoices.

select throws_ok(
  $$ select public.open_automotive_walk_in_work_order(
       current_setting('tests.tenant')::uuid, 'c142b22') $$,
  '22023'::char(5),
  null::text,
  'a second walk-in for a vehicle that already has an open work order is refused'
);

-- ---------------------------------------------------------------------------
-- C-9 — payments have to relate to the value of the work order
-- ---------------------------------------------------------------------------

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid, 'C09-3C33', 'Cliente C09'
  );

  perform public.add_automotive_work_order_item(
    v_work_order.id, 'service', 'Lavagem', 1, 100
  );

  perform set_config('tests.wo_payment', v_work_order.id::text, true);
end;
$$;

select throws_ok(
  $$ select public.record_automotive_work_order_payment(
       current_setting('tests.wo_payment')::uuid,
       'payment'::public.automotive_payment_kind,
       'pix'::public.automotive_payment_method,
       1000000) $$,
  '22023'::char(5),
  null::text,
  'a payment far above the work-order total is refused'
);

select throws_ok(
  $$ select public.record_automotive_work_order_payment(
       current_setting('tests.wo_payment')::uuid,
       'refund'::public.automotive_payment_kind,
       'pix'::public.automotive_payment_method,
       500) $$,
  '22023'::char(5),
  null::text,
  'a refund larger than everything received is refused'
);

-- ---------------------------------------------------------------------------
-- C-6 — opening a work order closes the appointment it came from
-- ---------------------------------------------------------------------------
-- The appointment stays 'scheduled' forever, keeping the professional reservation
-- alive, so the agenda and the Patio drift apart permanently.

do $$
declare
  v_appointment public.appointments;
  v_work_order public.automotive_work_orders;
begin
  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    '2026-09-09 13:00:00+00',
    'Agendamento C06'
  );

  select * into v_work_order
  from public.open_automotive_work_order(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.vehicle')::uuid,
    v_appointment.id,
    null,
    '2026-09-09 13:00:00+00'::timestamptz
  );

  perform set_config('tests.appointment_c06', v_appointment.id::text, true);
  perform set_config('tests.wo_c06', v_work_order.id::text, true);
end;
$$;

select isnt(
  (select status::text from public.appointments
   where id = current_setting('tests.appointment_c06')::uuid),
  'scheduled',
  'opening a work order advances the appointment it came from'
);

-- ---------------------------------------------------------------------------
-- C-5 — an occupied box can still be booked for a later date
-- ---------------------------------------------------------------------------
-- Physical occupancy is reserved as [received_at, 'infinity'), so the exclusion
-- constraint refuses every future reservation for that box while a car sits in it.
-- This is the normal operation of any business that books ahead.

do $$
declare
  v_box public.automotive_boxes;
  v_work_order public.automotive_work_orders;
begin
  select * into v_box
  from public.create_automotive_box(
    current_setting('tests.tenant')::uuid, 'B05', 'Box ocupado'
  );

  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid, 'C05-4D44', 'Cliente C05'
  );

  perform public.assign_automotive_work_order_box(v_work_order.id, v_box.id);

  perform set_config('tests.box_c05', v_box.id::text, true);
end;
$$;

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
    '2026-09-16 13:00:00+00',
    'Agendamento futuro no box ocupado'
  );

  perform set_config('tests.appointment_c05', v_appointment.id::text, true);
end;
$$;

select lives_ok(
  $$ select public.assign_automotive_appointment_box(
       current_setting('tests.appointment_c05')::uuid,
       current_setting('tests.box_c05')::uuid) $$,
  'a box holding a car today can still be booked for a later date'
);

select tests.clear_auth();

select * from finish();
rollback;
