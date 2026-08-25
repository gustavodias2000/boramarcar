-- Runs entirely inside a transaction and leaves no data behind.
-- Execute with: supabase db query --linked --file supabase/tests/automotive_operations_transaction_test.sql

begin;

select set_config(
  'request.jwt.claim.sub',
  '12121212-1212-4212-8212-121212121212',
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
  '12121212-1212-4212-8212-121212121212',
  'authenticated',
  'authenticated',
  'automotive-operations-test@example.invalid',
  now(),
  '{}'::jsonb,
  '{"full_name":"Automotive operations test"}'::jsonb,
  now(),
  now()
);

insert into public.businesses (id, name, business_type, timezone, created_by)
values (
  '23232323-2323-4232-8232-232323232323',
  'Automotive operations test',
  'automotive_aesthetics',
  'America/Sao_Paulo',
  '12121212-1212-4212-8212-121212121212'
);

insert into public.business_members (id, tenant_id, user_id, role)
values (
  '34343434-3434-4343-8343-343434343434',
  '23232323-2323-4232-8232-232323232323',
  '12121212-1212-4212-8212-121212121212',
  'owner'
);

insert into public.customers (id, tenant_id, name, created_by)
values (
  '45454545-4545-4454-8454-454545454545',
  '23232323-2323-4232-8232-232323232323',
  'Customer Automotive',
  '12121212-1212-4212-8212-121212121212'
);

insert into public.professionals (id, tenant_id, business_member_id, name, created_by)
values (
  '56565656-5656-4565-8565-565656565656',
  '23232323-2323-4232-8232-232323232323',
  '34343434-3434-4343-8343-343434343434',
  'Professional Automotive',
  '12121212-1212-4212-8212-121212121212'
);

insert into public.services (id, tenant_id, name, duration_minutes, base_price, created_by)
values (
  '67676767-6767-4676-8676-676767676767',
  '23232323-2323-4232-8232-232323232323',
  'Lavagem detalhada',
  60,
  120,
  '12121212-1212-4212-8212-121212121212'
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
  '23232323-2323-4232-8232-232323232323',
  '56565656-5656-4565-8565-565656565656',
  3,
  '08:00',
  '18:00',
  '12121212-1212-4212-8212-121212121212'
);

insert into public.automotive_vehicles (
  id,
  tenant_id,
  customer_id,
  license_plate,
  make,
  model,
  created_by
)
values (
  '78787878-7878-4787-8787-787878787878',
  '23232323-2323-4232-8232-232323232323',
  '45454545-4545-4454-8454-454545454545',
  'ABC-1D23',
  'Honda',
  'Civic',
  '12121212-1212-4212-8212-121212121212'
);

do $$
declare
  v_box public.automotive_boxes;
  v_appointment public.appointments;
  v_work_order public.automotive_work_orders;
  v_resource_id uuid;
begin
  select *
  into v_box
  from public.create_automotive_box(
    '23232323-2323-4232-8232-232323232323',
    'B01',
    'Box de teste'
  );

  select *
  into v_appointment
  from public.create_staff_appointment(
    '23232323-2323-4232-8232-232323232323',
    '45454545-4545-4454-8454-454545454545',
    '67676767-6767-4676-8676-676767676767',
    '56565656-5656-4565-8565-565656565656',
    '2026-08-26 12:00:00+00',
    'Automotive reservation'
  );

  perform public.assign_automotive_appointment_box(v_appointment.id, v_box.id);
  perform public.reschedule_staff_appointment(v_appointment.id, '2026-08-26 13:00:00+00');

  select reservation.scheduling_resource_id
  into v_resource_id
  from public.scheduling_resource_reservations reservation
  where reservation.appointment_id = v_appointment.id
    and reservation.scheduling_resource_id = v_box.scheduling_resource_id;

  if v_resource_id is distinct from v_box.scheduling_resource_id then
    raise exception 'Expected rescheduling to keep the appointment box reservation';
  end if;

  select *
  into v_work_order
  from public.open_automotive_work_order(
    '23232323-2323-4232-8232-232323232323'::uuid,
    '45454545-4545-4454-8454-454545454545'::uuid,
    '78787878-7878-4787-8787-787878787878'::uuid,
    v_appointment.id,
    v_box.id,
    '2026-08-26 13:00:00+00'::timestamptz,
    42000,
    50::smallint,
    'Sem avarias aparentes',
    'Chave reserva',
    '{"mirrors":true}'::jsonb,
    'Entrada pelo agendamento'
  );

  if not exists (
    select 1
    from public.automotive_patio patio
    where patio.id = v_work_order.id
      and patio.box_id = v_box.id
      and patio.total_amount = 120
      and patio.payment_status = 'unpaid'
  ) then
    raise exception 'Expected the open work order to appear in the Pátio';
  end if;

  perform public.add_automotive_work_order_item(
    v_work_order.id,
    'product',
    'Aromatizante',
    1,
    30
  );
  perform public.transition_automotive_work_order(v_work_order.id, 'in_service');
  perform public.transition_automotive_work_order(v_work_order.id, 'service_completed');
  perform public.transition_automotive_work_order(v_work_order.id, 'awaiting_pickup');
  perform public.record_automotive_work_order_payment(
    v_work_order.id,
    'payment',
    'pix',
    150
  );
  perform public.deliver_automotive_work_order(
    v_work_order.id,
    '2026-08-26 15:00:00+00',
    'Customer Automotive',
    'Entrega confirmada',
    '{"key_returned":true}'::jsonb
  );

  if exists (
    select 1
    from public.automotive_patio patio
    where patio.id = v_work_order.id
  ) then
    raise exception 'Delivered work orders must not remain in the Pátio';
  end if;

  if exists (
    select 1
    from public.scheduling_resource_reservations reservation
    where reservation.scheduling_resource_id = v_box.scheduling_resource_id
      and reservation.kind = 'block'
  ) then
    raise exception 'Delivery must release the occupied box';
  end if;
end;
$$;

rollback;
