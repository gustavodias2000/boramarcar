-- Client booking API used by the Android app. The consumer is not a business
-- member, so every success below also proves the SECURITY DEFINER boundary.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('mobile-client', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.outsider', t ->> 'outsider_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config(
    'tests.future_start',
    (
      (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '7 days' + time '12:00')
      at time zone 'America/Sao_Paulo'
    )::text,
    true
  );
end;
$$;

-- The fixture is built without an authenticated test identity. It intentionally
-- creates a code with a known value so the consumer test can redeem it.
insert into public.business_invitations (tenant_id, code, created_by)
values (
  current_setting('tests.tenant')::uuid,
  'MOBILE2026',
  current_setting('tests.owner')::uuid
);

select tests.act_as(current_setting('tests.outsider')::uuid);

select lives_ok(
  $$ select public.redeem_business_invitation('MOBILE2026', 'Cliente Mobile') $$,
  'a signed-in consumer redeems a company invitation'
);

select results_eq(
  $$ select business_name, business_type::text from public.list_customer_businesses() $$,
  $$ values ('mobile-client'::text, 'barbershop'::text) $$,
  'the customer sees only the business linked by the invitation'
);

select results_eq(
  $$ select jsonb_array_length(public.get_customer_booking_catalog(current_setting('tests.tenant')::uuid)->'services') $$,
  $$ values (1) $$,
  'the booking catalogue exposes active services without table access'
);

select ok(
  (
    select count(*) > 0
    from public.list_customer_available_slots(
      current_setting('tests.tenant')::uuid,
      current_setting('tests.service')::uuid,
      current_setting('tests.professional')::uuid,
      (current_setting('tests.future_start')::timestamptz at time zone 'America/Sao_Paulo')::date
    )
  ),
  'the linked customer can read future slots'
);

select lives_ok(
  $$ select public.create_customer_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       current_setting('tests.future_start')::timestamptz
     ) $$,
  'the client creates an appointment in one transaction'
);

select ok(
  (
    select count(*) = 1
    from public.list_my_customer_appointments(current_setting('tests.tenant')::uuid)
  ),
  'the client reads its own appointment, not the whole agenda'
);

select throws_ok(
  $$ select public.create_customer_appointment(
       current_setting('tests.tenant')::uuid,
       current_setting('tests.service')::uuid,
       current_setting('tests.professional')::uuid,
       current_setting('tests.future_start')::timestamptz
     ) $$,
  '23P01'::char(5),
  null,
  'a duplicate client reservation is refused by the database constraint'
);

select tests.clear_auth();
select * from finish();
rollback;
