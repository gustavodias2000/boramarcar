-- Scheduling — migrated from scheduling_transaction_test.sql.
--
-- Same assertions as before, with two changes: they are pgTAP so a runner can
-- execute them, and they run under a real authenticated identity so the RPCs are
-- exercised through RLS rather than as superuser.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('sched', 'barbershop');
begin
  perform set_config('tests.tenant',       t ->> 'tenant_id',       true);
  perform set_config('tests.owner',        t ->> 'owner_id',        true);
  perform set_config('tests.customer',     t ->> 'customer_id',     true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service',      t ->> 'service_id',      true);
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- A reservation is created and holds the resource
-- ---------------------------------------------------------------------------

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
    '2026-08-26 12:00:00+00',
    'First reservation'
  );

  perform set_config('tests.appointment', v_appointment.id::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.appointments
     where id = current_setting('tests.appointment')::uuid $$,
  'the appointment was created'
);

select results_eq(
  $$ select count(*)::int from public.scheduling_resource_reservations
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  $$ values (1) $$,
  'the appointment holds exactly one resource reservation'
);

-- ---------------------------------------------------------------------------
-- The exclusion constraint refuses an overlap
-- ---------------------------------------------------------------------------
-- This is the guarantee the whole scheduling model rests on: capacity conflict is
-- refused by the database, not by application code.

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-08-26 12:30:00+00'::timestamptz,
       'Overlapping reservation') $$,
  '23P01',
  null,
  'an overlapping reservation for the same professional is refused'
);

-- ---------------------------------------------------------------------------
-- Transition events keep both statuses (regression for migration 000300)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.transition_staff_appointment(
       current_setting('tests.appointment')::uuid, 'confirmed') $$,
  'the appointment can be confirmed'
);

select results_eq(
  $$ select previous_status::text, next_status::text
     from public.appointment_events
     where appointment_id = current_setting('tests.appointment')::uuid
       and event_type = 'confirmed' $$,
  $$ values ('scheduled'::text, 'confirmed'::text) $$,
  'the transition event retains both the previous and the next status'
);

-- ---------------------------------------------------------------------------
-- Completing an appointment releases the reserved capacity
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.transition_staff_appointment(
       current_setting('tests.appointment')::uuid, 'in_progress') $$,
  'the appointment can start'
);

select lives_ok(
  $$ select public.transition_staff_appointment(
       current_setting('tests.appointment')::uuid, 'completed') $$,
  'the appointment can complete'
);

select is_empty(
  $$ select id from public.scheduling_resource_reservations
     where appointment_id = current_setting('tests.appointment')::uuid $$,
  'completing the appointment releases the reservation'
);

select lives_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-08-26 12:00:00+00'::timestamptz,
       'Slot reused after completion') $$,
  'the freed slot can be booked again'
);

-- ---------------------------------------------------------------------------
-- Availability and blocks
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.create_staff_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.customer')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       '2026-08-26 04:00:00+00'::timestamptz,
       'Outside the recurring availability') $$,
  'P0001',
  'Professional is unavailable for the requested interval',
  'an appointment outside the recurring availability is refused'
);

select tests.clear_auth();

select * from finish();
rollback;
