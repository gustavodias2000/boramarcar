-- Test scaffolding — LOCAL ONLY.
--
-- This file is loaded through `[db.seed] sql_paths` in supabase/config.toml, so it
-- runs on `supabase db reset` / `supabase start` and NEVER reaches a deployed
-- project through `supabase db push`. That separation is deliberate: Etapa 1 adds a
-- test asserting exactly which functions are executable in production, and shipping
-- ~1000 pgTAP functions alongside it would defeat the purpose.
--
-- Everything here lives in the `tests` schema and is granted to public, because the
-- schema only exists on developer machines and in CI.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to public;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
-- The single missing piece that makes RLS testable. Without it, tests run as the
-- connection role (superuser), which bypasses every policy — which is precisely why
-- the pre-existing transaction tests never exercised a single policy.
--
-- `auth.uid()` reads the legacy `request.jwt.claim.sub` GUC first and falls back to
-- the `request.jwt.claims` JSON, so both are set.

create or replace function tests.act_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Returns to the session role (superuser) so fixtures can write freely again.
-- `reset role` always returns to session_user and is allowed from any role.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

create or replace function tests.create_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    v_id, 'authenticated', 'authenticated', p_email, now(),
    '{}'::jsonb, jsonb_build_object('full_name', p_email), now(), now()
  );

  return v_id;
end;
$$;

-- Builds a complete tenant with one user per role, plus the minimum operational
-- catalogue every scheduling test needs. Returns every id as jsonb so callers can
-- pick what they need without a composite type.
--
-- Schedule rules cover all seven weekdays from 06:00 to 22:00 so tests do not break
-- when the fixed dates they use land on a different day of the week.
create or replace function tests.build_tenant(
  p_slug text,
  p_business_type public.business_type default 'automotive_aesthetics'
)
returns jsonb
language plpgsql
as $$
declare
  v_owner uuid;
  v_manager uuid;
  v_receptionist uuid;
  v_technician uuid;
  v_cashier uuid;
  v_outsider uuid;
  v_tenant uuid;
  v_technician_member uuid;
  v_customer uuid;
  v_professional uuid;
  v_service uuid;
  v_weekday integer;
begin
  v_owner        := tests.create_user(p_slug || '-owner@example.invalid');
  v_manager      := tests.create_user(p_slug || '-manager@example.invalid');
  v_receptionist := tests.create_user(p_slug || '-reception@example.invalid');
  v_technician   := tests.create_user(p_slug || '-technician@example.invalid');
  v_cashier      := tests.create_user(p_slug || '-cashier@example.invalid');
  v_outsider     := tests.create_user(p_slug || '-outsider@example.invalid');

  insert into public.businesses (name, business_type, timezone, created_by)
  values (p_slug, p_business_type, 'America/Sao_Paulo', v_owner)
  returning id into v_tenant;

  insert into public.business_members (tenant_id, user_id, role)
  values
    (v_tenant, v_owner, 'owner'),
    (v_tenant, v_manager, 'manager'),
    (v_tenant, v_receptionist, 'receptionist'),
    (v_tenant, v_cashier, 'cashier');

  insert into public.business_members (tenant_id, user_id, role)
  values (v_tenant, v_technician, 'professional')
  returning id into v_technician_member;

  insert into public.customers (tenant_id, name, created_by)
  values (v_tenant, p_slug || ' customer', v_owner)
  returning id into v_customer;

  -- Dado pessoal vive segregado desde a migration de LGPD: `customers` guarda só o
  -- que a operação precisa ver, o resto fica aqui, sob política própria (C-8).
  insert into public.customer_contacts (
    customer_id, tenant_id, cpf_cnpj, phone, email, birthday_md
  )
  values (v_customer, v_tenant, '00000000000', '11999999999',
          p_slug || '-customer@example.invalid', '03-14');

  insert into public.professionals (tenant_id, business_member_id, name, created_by)
  values (v_tenant, v_technician_member, p_slug || ' technician', v_owner)
  returning id into v_professional;

  insert into public.services (tenant_id, name, duration_minutes, base_price, created_by)
  values (v_tenant, p_slug || ' service', 60, 120, v_owner)
  returning id into v_service;

  for v_weekday in 0..6 loop
    insert into public.professional_schedule_rules (
      tenant_id, professional_id, weekday, starts_at, ends_at, created_by
    )
    values (v_tenant, v_professional, v_weekday, '06:00', '22:00', v_owner);
  end loop;

  return jsonb_build_object(
    'tenant_id',          v_tenant,
    'owner_id',           v_owner,
    'manager_id',         v_manager,
    'receptionist_id',    v_receptionist,
    'technician_id',      v_technician,
    'cashier_id',         v_cashier,
    'outsider_id',        v_outsider,
    'technician_member_id', v_technician_member,
    'customer_id',        v_customer,
    'professional_id',    v_professional,
    'service_id',         v_service
  );
end;
$$;

-- Convenience accessor: tests.id(fixture, 'tenant_id')
create or replace function tests.id(p_fixture jsonb, p_key text)
returns uuid
language sql
immutable
as $$
  select (p_fixture ->> p_key)::uuid;
$$;

-- Registers a vehicle directly (bypassing the walk-in RPC) for tests that need one
-- to already exist.
create or replace function tests.create_vehicle(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_plate text,
  p_created_by uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.automotive_vehicles (
    tenant_id, customer_id, license_plate, make, model, created_by
  )
  values (p_tenant_id, p_customer_id, p_plate, 'Honda', 'Civic', p_created_by)
  returning id into v_id;

  return v_id;
end;
$$;
