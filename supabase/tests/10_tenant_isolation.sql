-- Tenant isolation matrix.
--
-- Two complete tenants, and the owner of A trying to reach B. The schema defends
-- this structurally (every relation uses a composite `(id, tenant_id)` foreign key)
-- and through RLS, but until now neither was ever exercised: the pre-existing tests
-- ran as superuser, with a single tenant.
--
-- Every negative assertion is paired with a positive control on tenant A. Without
-- them, a query that returns nothing because it is simply wrong would read as a pass.

begin;
select * from no_plan();

-- Fixtures are built as the session superuser, before any identity switch.
do $$
declare
  a jsonb := tests.build_tenant('iso-a', 'barbershop');
  b jsonb := tests.build_tenant('iso-b', 'automotive_aesthetics');
begin
  perform set_config('tests.a_tenant',   a ->> 'tenant_id',   true);
  perform set_config('tests.a_owner',    a ->> 'owner_id',    true);
  perform set_config('tests.a_customer', a ->> 'customer_id', true);
  perform set_config('tests.a_outsider', a ->> 'outsider_id', true);

  perform set_config('tests.b_tenant',       b ->> 'tenant_id',       true);
  perform set_config('tests.b_owner',        b ->> 'owner_id',        true);
  perform set_config('tests.b_customer',     b ->> 'customer_id',     true);
  perform set_config('tests.b_professional', b ->> 'professional_id', true);
  perform set_config('tests.b_service',      b ->> 'service_id',      true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner of tenant A
-- ---------------------------------------------------------------------------

select tests.act_as(current_setting('tests.a_owner')::uuid);

-- Positive controls first: prove the identity actually took effect.

select isnt_empty(
  $$ select id from public.businesses
     where id = current_setting('tests.a_tenant')::uuid $$,
  'control — A sees its own business'
);

select isnt_empty(
  $$ select id from public.customers
     where tenant_id = current_setting('tests.a_tenant')::uuid $$,
  'control — A sees its own customers'
);

select results_eq(
  $$ select auth.uid() $$,
  $$ select current_setting('tests.a_owner')::uuid $$,
  'control — auth.uid() resolves to the acting user'
);

-- SELECT isolation.

select is_empty(
  $$ select id from public.businesses
     where id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the business row of B'
);

select is_empty(
  $$ select id from public.business_members
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the members of B'
);

select is_empty(
  $$ select id from public.customers
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the customers of B'
);

select is_empty(
  $$ select id from public.professionals
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the professionals of B'
);

select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the services of B'
);

select is_empty(
  $$ select id from public.appointments
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the appointments of B'
);

select is_empty(
  $$ select id from public.professional_schedule_rules
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the availability rules of B'
);

select is_empty(
  $$ select id from public.scheduling_resources
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the scheduling resources of B'
);

select is_empty(
  $$ select id from public.automotive_vehicles
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the vehicles of B'
);

select is_empty(
  $$ select id from public.automotive_work_orders
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the work orders of B'
);

select is_empty(
  $$ select id from public.automotive_patio
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the Patio of B through the view'
);

select is_empty(
  $$ select id from public.automotive_loyalty_entries
     where tenant_id = current_setting('tests.b_tenant')::uuid $$,
  'A cannot read the loyalty ledger of B'
);

-- INSERT isolation. RLS refusal and a missing grant both raise 42501, so the test
-- holds whichever way Etapa 1 lands.

select throws_ok(
  $$ insert into public.customers (tenant_id, name)
     values (current_setting('tests.b_tenant')::uuid, 'injected by A') $$,
  '42501'::char(5),
  null,
  'A cannot insert a customer into B'
);

select throws_ok(
  $$ insert into public.business_members (tenant_id, user_id, role)
     values (current_setting('tests.b_tenant')::uuid,
             current_setting('tests.a_owner')::uuid, 'owner') $$,
  '42501'::char(5),
  null,
  'A cannot grant itself membership of B'
);

-- UPDATE and DELETE isolation. RLS filters the rows away rather than raising, so
-- the assertion is that B's row is untouched.

-- Wrapped because the two mechanisms differ: RLS filters the rows away silently,
-- while a missing grant raises 42501. Both mean "A cannot touch B", and the assertion
-- that follows is what actually decides. Without the wrapper, a grant change in
-- Etapa 1 would abort the file instead of being judged by the test.
do $$
begin
  update public.customers
  set name = 'renamed by A'
  where tenant_id = current_setting('tests.b_tenant')::uuid;

  delete from public.customers
  where tenant_id = current_setting('tests.b_tenant')::uuid;
exception
  when insufficient_privilege then null;
end;
$$;

select tests.clear_auth();

select results_eq(
  $$ select name from public.customers
     where id = current_setting('tests.b_customer')::uuid $$,
  $$ values ('iso-b customer'::text) $$,
  'the customer of B survived both the update and the delete attempt by A'
);

-- ---------------------------------------------------------------------------
-- An authenticated user with no membership anywhere
-- ---------------------------------------------------------------------------

select tests.act_as(current_setting('tests.a_outsider')::uuid);

select is_empty(
  $$ select id from public.businesses $$,
  'a user without membership sees no business at all'
);

select is_empty(
  $$ select id from public.customers $$,
  'a user without membership sees no customer at all'
);

select is_empty(
  $$ select id from public.automotive_patio $$,
  'a user without membership sees an empty Patio'
);

select tests.clear_auth();

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
-- Until the customer area exists (Etapa 10) anon must see nothing. These pass
-- through RLS even while the default grants of C-3 are still in place, which is
-- exactly why the privilege snapshot in 00_ is a separate file: RLS being right
-- does not make the grants right.

select tests.act_as_anon();

-- ANON NAO CHEGA A CONSULTAR — e essa e a barreira mais forte, nao a mais fraca.
--
-- Estas asercoes nasceram antes da Etapa 1. Naquele momento `anon` tinha os grants
-- padrao do Supabase e a RLS e que filtrava as linhas, entao `is_empty` era a leitura
-- certa. A `20260825000200_harden_privileges.sql` revogou TODOS os grants de `anon`, de
-- proposito: nao ha superficie publica ainda, e ate existir ele nao tem por que
-- alcancar objeto nenhum.
--
-- Consequencia: a consulta morre com 42501 ANTES de a politica ser avaliada. Afirmar
-- `is_empty` agora seria afirmar o mecanismo fraco quando o forte esta em vigor.

select throws_ok(
  $$ select id from public.businesses $$, '42501'::char(5), null::text,
  'anon nao alcanca businesses — recusado por privilegio, antes da RLS'
);
select throws_ok(
  $$ select id from public.customers $$, '42501'::char(5), null::text,
  'anon nao alcanca customers'
);
select throws_ok(
  $$ select id from public.appointments $$, '42501'::char(5), null::text,
  'anon nao alcanca appointments'
);
select throws_ok(
  $$ select id from public.automotive_work_orders $$, '42501'::char(5), null::text,
  'anon nao alcanca automotive_work_orders'
);

select tests.clear_auth();

select * from finish();
rollback;
