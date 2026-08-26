-- Automotive operations — migrated from automotive_operations_transaction_test.sql.
--
-- Covers the full desk cycle: walk-in entry, box creation, appointment-to-work-order,
-- private media, items, stage transitions, payment and delivery. Now runs under a real
-- authenticated identity, so every RPC passes through its role check and every read
-- passes through RLS.
--
-- One assertion from the original file was deliberately NOT carried over: it called the
-- walk-in entry twice for the same plate and treated the second work order as correct.
-- That is defect C-13. The half that is genuinely correct — reusing the customer and the
-- vehicle — is kept here; the half that is a bug moved to 50_known_defects.sql.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('auto', 'automotive_aesthetics');
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
      'ABC-1D23',
      tests.id(t, 'owner_id')
    )::text,
    true
  );
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- Walk-in entry creates customer, vehicle and work order in one transaction
-- ---------------------------------------------------------------------------

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid,
    'WAL-9K55',
    'Walk-in Customer',
    '11999999999',
    'Fiat',
    'Pulse',
    'Vermelho',
    2025,
    1300,
    75::smallint,
    'Sem avarias aparentes',
    'Entrada sem agendamento'
  );

  perform set_config('tests.walk_in', v_work_order.id::text, true);
  perform set_config('tests.walk_in_customer', v_work_order.customer_id::text, true);
  perform set_config('tests.walk_in_vehicle', v_work_order.vehicle_id::text, true);
end;
$$;

select results_eq(
  $$ select customer_name, license_plate, status::text
     from public.automotive_patio
     where id = current_setting('tests.walk_in')::uuid $$,
  $$ values ('Walk-in Customer'::text, 'WAL-9K55'::text, 'awaiting_service'::text) $$,
  'the walk-in work order appears in the Patio'
);

-- The plate is normalised, so a differently formatted plate resolves to the same
-- vehicle instead of creating a duplicate.

select results_eq(
  $$ select count(*)::int from public.automotive_vehicles
     where tenant_id = current_setting('tests.tenant')::uuid
       and normalized_license_plate = 'WAL9K55' $$,
  $$ values (1) $$,
  'the normalised plate is unique within the tenant'
);

-- ---------------------------------------------------------------------------
-- Boxes and the appointment reservation (regression for migration 000600)
-- ---------------------------------------------------------------------------

do $$
declare
  v_box public.automotive_boxes;
  v_appointment public.appointments;
begin
  select * into v_box
  from public.create_automotive_box(
    current_setting('tests.tenant')::uuid, 'B01', 'Box de teste'
  );

  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    '2026-08-26 12:00:00+00',
    'Automotive reservation'
  );

  perform public.assign_automotive_appointment_box(v_appointment.id, v_box.id);
  perform public.reschedule_staff_appointment(v_appointment.id, '2026-08-26 13:00:00+00');

  perform set_config('tests.box', v_box.id::text, true);
  perform set_config('tests.box_resource', v_box.scheduling_resource_id::text, true);
  perform set_config('tests.appointment', v_appointment.id::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.scheduling_resource_reservations
     where appointment_id = current_setting('tests.appointment')::uuid
       and scheduling_resource_id = current_setting('tests.box_resource')::uuid $$,
  'rescheduling keeps the box reservation attached to the appointment'
);

-- ---------------------------------------------------------------------------
-- Opening the work order from the appointment
-- ---------------------------------------------------------------------------

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_work_order(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.vehicle')::uuid,
    current_setting('tests.appointment')::uuid,
    current_setting('tests.box')::uuid,
    '2026-08-26 13:00:00+00'::timestamptz,
    42000,
    50::smallint,
    'Sem avarias aparentes',
    'Chave reserva',
    '{"mirrors":true}'::jsonb,
    'Entrada pelo agendamento'
  );

  perform set_config('tests.work_order', v_work_order.id::text, true);
end;
$$;

select results_eq(
  $$ select box_id, total_amount, payment_status::text
     from public.automotive_patio
     where id = current_setting('tests.work_order')::uuid $$,
  $$ select current_setting('tests.box')::uuid, 120::numeric, 'unpaid'::text $$,
  'the work order enters the Patio with the box, the service total and no payment'
);

-- ---------------------------------------------------------------------------
-- Private media
-- ---------------------------------------------------------------------------
-- The storage object has to exist before it can be registered. Inserting into
-- storage.objects is a fixture step, so it runs as the session role.

select tests.clear_auth();

do $$
declare
  v_path text;
begin
  v_path := format(
    '%s/%s/intake/89898989-8989-4898-8898-898989898989.webp',
    current_setting('tests.tenant'),
    current_setting('tests.work_order')
  );

  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'automotive-work-order-media',
    v_path,
    current_setting('tests.owner')::uuid,
    '{"mimetype":"image/webp","size":1}'::jsonb
  );

  perform set_config('tests.media_path', v_path, true);
end;
$$;

select tests.act_as(current_setting('tests.owner')::uuid);

do $$
declare
  v_media public.automotive_work_order_media;
begin
  select * into v_media
  from public.register_automotive_work_order_media(
    current_setting('tests.work_order')::uuid,
    'intake',
    current_setting('tests.media_path'),
    'Foto de entrada'
  );

  perform set_config('tests.media', v_media.id::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.automotive_work_order_media
     where id = current_setting('tests.media')::uuid
       and storage_path = current_setting('tests.media_path') $$,
  'the uploaded object is registered as work-order media'
);

-- Controle positivo de C-10: com metadado, o objeto e legivel.
select ok(
  public.can_read_automotive_work_order_media_object(current_setting('tests.media_path')),
  'control — a registered media object is readable'
);

-- A path pointing at another tenant must be refused even though the caller is a
-- legitimate scheduler in their own tenant.
select throws_ok(
  $$ select public.register_automotive_work_order_media(
       current_setting('tests.work_order')::uuid,
       'intake',
       '00000000-0000-4000-8000-000000000000/'
         || current_setting('tests.work_order')
         || '/intake/11111111-1111-4111-8111-111111111111.webp',
       'Caminho forjado') $$,
  '22023'::char(5),
  'The media path must match the tenant, work order and stage',
  'a media path belonging to another tenant is refused'
);

select lives_ok(
  $$ select public.remove_automotive_work_order_media(
       current_setting('tests.media')::uuid) $$,
  'the media metadata can be removed'
);

select is_empty(
  $$ select id from public.automotive_work_order_media
     where id = current_setting('tests.media')::uuid $$,
  'removing media deletes the work-order metadata'
);

-- C-10 — o arquivo continua no bucket (a RPC deixou de apaga-lo na migration 000800),
-- mas sem o metadado ele fica inerte: some da interface E deixa de ser legivel por
-- URL assinada.
select ok(
  not public.can_read_automotive_work_order_media_object(current_setting('tests.media_path')),
  'an orphan storage object is unreadable once its metadata is gone (C-10)'
);

select tests.clear_auth();

select isnt_empty(
  $$ select name from storage.objects
     where name = current_setting('tests.media_path') $$,
  'the orphan object is still physically in the bucket — which is why the lock matters'
);

select tests.act_as(current_setting('tests.owner')::uuid);

-- ---------------------------------------------------------------------------
-- Items, stages, payment and delivery
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.add_automotive_work_order_item(
       current_setting('tests.work_order')::uuid,
       'product'::public.automotive_work_order_item_kind,
       'Aromatizante', 1, 30) $$,
  'a product item can be added to the work order'
);

select results_eq(
  $$ select total_amount from public.automotive_patio
     where id = current_setting('tests.work_order')::uuid $$,
  $$ values (150::numeric) $$,
  'the Patio total follows the generated line totals'
);

select lives_ok(
  $$ select public.transition_automotive_work_order(
       current_setting('tests.work_order')::uuid, 'in_service') $$,
  'the work order can move to in_service'
);

select throws_ok(
  $$ select public.transition_automotive_work_order(
       current_setting('tests.work_order')::uuid, 'awaiting_service') $$,
  '22023'::char(5),
  'Invalid Automotive work-order stage transition',
  'the work order cannot move backwards to awaiting_service'
);

select lives_ok(
  $$ select public.transition_automotive_work_order(
       current_setting('tests.work_order')::uuid, 'service_completed') $$,
  'the work order can move to service_completed'
);

select lives_ok(
  $$ select public.transition_automotive_work_order(
       current_setting('tests.work_order')::uuid, 'awaiting_pickup') $$,
  'the work order can move to awaiting_pickup'
);

select lives_ok(
  $$ select public.record_automotive_work_order_payment(
       current_setting('tests.work_order')::uuid,
       'payment'::public.automotive_payment_kind,
       'pix'::public.automotive_payment_method,
       150) $$,
  'the work order can be paid in full'
);

select lives_ok(
  $$ select public.deliver_automotive_work_order(
       current_setting('tests.work_order')::uuid,
       '2026-08-26 15:00:00+00'::timestamptz,
       'Customer Automotive',
       'Entrega confirmada',
       '{"key_returned":true}'::jsonb) $$,
  'the work order can be delivered'
);

select is_empty(
  $$ select id from public.automotive_patio
     where id = current_setting('tests.work_order')::uuid $$,
  'a delivered work order leaves the Patio'
);

select is_empty(
  $$ select id from public.scheduling_resource_reservations
     where scheduling_resource_id = current_setting('tests.box_resource')::uuid
       and kind = 'block' $$,
  'delivery releases the occupied box'
);

select tests.clear_auth();

select * from finish();
rollback;
