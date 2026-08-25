-- Runs entirely inside a transaction and leaves no data behind.
-- Execute with: supabase db query --linked --file supabase/tests/scheduling_transaction_test.sql

begin;

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'scheduling-transaction-test@example.invalid',
  now(),
  '{}'::jsonb,
  '{"full_name":"Scheduling transaction test"}'::jsonb,
  now(),
  now()
);

insert into public.businesses (id, name, business_type, timezone, created_by)
values (
  '22222222-2222-4222-8222-222222222222',
  'Scheduling transaction test',
  'barbershop',
  'America/Sao_Paulo',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.business_members (id, tenant_id, user_id, role)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'owner'
);

insert into public.customers (id, tenant_id, name, created_by)
values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'Customer test',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.professionals (id, tenant_id, business_member_id, name, created_by)
values (
  '55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'Professional test',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.services (id, tenant_id, name, duration_minutes, base_price, created_by)
values (
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  'Service test',
  60,
  0,
  '11111111-1111-4111-8111-111111111111'
);

insert into public.professional_schedule_rules (
  tenant_id,
  professional_id,
  weekday,
  starts_at,
  ends_at,
  created_by
)
values (
  '22222222-2222-4222-8222-222222222222',
  '55555555-5555-4555-8555-555555555555',
  3,
  '08:00',
  '18:00',
  '11111111-1111-4111-8111-111111111111'
);

do $$
declare
  v_appointment public.appointments;
begin
  select *
  into v_appointment
  from public.create_staff_appointment(
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    '66666666-6666-4666-8666-666666666666',
    '55555555-5555-4555-8555-555555555555',
    '2026-08-26 12:00:00+00',
    'First reservation'
  );

  begin
    perform public.create_staff_appointment(
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '66666666-6666-4666-8666-666666666666',
      '55555555-5555-4555-8555-555555555555',
      '2026-08-26 12:30:00+00',
      'Overlapping reservation'
    );
    raise exception 'Expected the overlapping reservation to be rejected';
  exception
    when exclusion_violation then
      null;
  end;

  perform public.transition_staff_appointment(v_appointment.id, 'confirmed');

  if not exists (
    select 1
    from public.appointment_events event
    where event.appointment_id = v_appointment.id
      and event.event_type = 'confirmed'
      and event.previous_status = 'scheduled'
      and event.next_status = 'confirmed'
  ) then
    raise exception 'Expected the transition event to retain both statuses';
  end if;
end;
$$;

rollback;
