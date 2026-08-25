create or replace function public.open_automotive_walk_in_work_order(
  p_tenant_id uuid,
  p_license_plate text,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_make text default null,
  p_model text default null,
  p_color text default null,
  p_year_model integer default null,
  p_odometer integer default null,
  p_fuel_level smallint default null,
  p_condition_notes text default null,
  p_notes text default null
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_plate text := upper(regexp_replace(coalesce(p_license_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_customer public.customers;
  v_vehicle public.automotive_vehicles;
  v_work_order public.automotive_work_orders;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can open an Automotive walk-in work order' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if char_length(v_normalized_plate) not between 6 and 8 then
    raise exception 'Vehicle plate must contain between 6 and 8 letters or numbers' using errcode = '22023';
  end if;

  select *
  into v_vehicle
  from public.automotive_vehicles vehicle
  where vehicle.tenant_id = p_tenant_id
    and vehicle.normalized_license_plate = v_normalized_plate
  for key share;

  if found then
    if not v_vehicle.active then
      raise exception 'Vehicle found for this plate is inactive' using errcode = 'P0001';
    end if;

    select *
    into v_customer
    from public.customers customer
    where customer.id = v_vehicle.customer_id
      and customer.tenant_id = p_tenant_id
    for key share;

    if not found or not v_customer.active then
      raise exception 'Active customer not found for this vehicle' using errcode = 'P0001';
    end if;
  else
    if nullif(trim(coalesce(p_customer_name, '')), '') is null then
      raise exception 'Customer name is required for a new vehicle' using errcode = '22023';
    end if;

    insert into public.customers (
      tenant_id,
      name,
      whatsapp,
      created_by
    )
    values (
      p_tenant_id,
      trim(p_customer_name),
      nullif(trim(p_customer_phone), ''),
      (select auth.uid())
    )
    returning * into v_customer;

    insert into public.automotive_vehicles (
      tenant_id,
      customer_id,
      license_plate,
      make,
      model,
      color,
      year_model,
      created_by
    )
    values (
      p_tenant_id,
      v_customer.id,
      upper(trim(p_license_plate)),
      nullif(trim(p_make), ''),
      nullif(trim(p_model), ''),
      nullif(trim(p_color), ''),
      p_year_model,
      (select auth.uid())
    )
    returning * into v_vehicle;
  end if;

  select *
  into v_work_order
  from public.open_automotive_work_order(
    p_tenant_id,
    v_customer.id,
    v_vehicle.id,
    null,
    null,
    now(),
    p_odometer,
    p_fuel_level,
    p_condition_notes,
    null,
    '{}'::jsonb,
    p_notes
  );

  return v_work_order;
end;
$$;

revoke all on function public.open_automotive_walk_in_work_order(uuid, text, text, text, text, text, text, integer, integer, smallint, text, text) from public;
grant execute on function public.open_automotive_walk_in_work_order(uuid, text, text, text, text, text, text, integer, integer, smallint, text, text) to authenticated;
