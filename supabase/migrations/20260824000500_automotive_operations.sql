-- Automotive operations: vehicles, boxes, work orders, intake, payment,
-- delivery and the derived Pátio view. All work-order writes are transactional.

create type public.automotive_work_order_status as enum (
  'awaiting_service',
  'in_service',
  'service_completed',
  'awaiting_pickup',
  'delivered',
  'cancelled'
);

create type public.automotive_work_order_item_kind as enum (
  'service',
  'product'
);

create type public.automotive_payment_kind as enum (
  'payment',
  'refund'
);

create type public.automotive_payment_method as enum (
  'cash',
  'pix',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'other'
);

create type public.automotive_media_stage as enum (
  'intake',
  'execution',
  'delivery'
);

create table public.automotive_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  license_plate text not null,
  normalized_license_plate text generated always as (
    upper(regexp_replace(license_plate, '[^A-Za-z0-9]', '', 'g'))
  ) stored,
  make text,
  model text,
  color text,
  year_model integer,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, normalized_license_plate),
  constraint automotive_vehicles_plate_length check (
    char_length(normalized_license_plate) between 6 and 8
  ),
  constraint automotive_vehicles_year_model check (
    year_model is null or year_model between 1900 and 2100
  ),
  constraint automotive_vehicles_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete restrict
);

create table public.automotive_boxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  scheduling_resource_id uuid not null,
  code text not null,
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, scheduling_resource_id),
  unique (tenant_id, code),
  constraint automotive_boxes_code_length check (char_length(trim(code)) between 1 and 40),
  constraint automotive_boxes_name_length check (char_length(trim(name)) between 1 and 160),
  constraint automotive_boxes_resource_belongs_to_tenant
    foreign key (scheduling_resource_id, tenant_id)
    references public.scheduling_resources (id, tenant_id)
    on delete restrict
);

create table public.automotive_work_order_number_counters (
  tenant_id uuid primary key references public.businesses (id) on delete cascade,
  next_number integer not null default 1,
  constraint automotive_work_order_number_counters_positive check (next_number > 0)
);

create table public.automotive_work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  number integer not null,
  customer_id uuid not null,
  vehicle_id uuid not null,
  appointment_id uuid,
  assigned_professional_id uuid,
  assigned_box_id uuid,
  box_reservation_id uuid,
  status public.automotive_work_order_status not null default 'awaiting_service',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, number),
  unique (appointment_id),
  unique (box_reservation_id),
  constraint automotive_work_orders_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_vehicle_belongs_to_tenant
    foreign key (vehicle_id, tenant_id)
    references public.automotive_vehicles (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_professional_belongs_to_tenant
    foreign key (assigned_professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_box_belongs_to_tenant
    foreign key (assigned_box_id, tenant_id)
    references public.automotive_boxes (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_box_reservation_belongs_to_tenant
    foreign key (box_reservation_id, tenant_id)
    references public.scheduling_resource_reservations (id, tenant_id)
    on delete restrict,
  constraint automotive_work_orders_box_reference_pair check (
    (assigned_box_id is null and box_reservation_id is null)
    or (assigned_box_id is not null and box_reservation_id is not null)
  )
);

create table public.automotive_work_order_intakes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  odometer integer,
  fuel_level smallint,
  condition_notes text,
  received_items text,
  checklist jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (work_order_id),
  constraint automotive_work_order_intakes_odometer_nonnegative check (
    odometer is null or odometer >= 0
  ),
  constraint automotive_work_order_intakes_fuel_level_range check (
    fuel_level is null or fuel_level between 0 and 100
  ),
  constraint automotive_work_order_intakes_checklist_object check (
    jsonb_typeof(checklist) = 'object'
  ),
  constraint automotive_work_order_intakes_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete cascade
);

create table public.automotive_work_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  source_service_id uuid,
  kind public.automotive_work_order_item_kind not null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint automotive_work_order_items_description_length check (
    char_length(trim(description)) between 1 and 240
  ),
  constraint automotive_work_order_items_quantity_positive check (quantity > 0),
  constraint automotive_work_order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint automotive_work_order_items_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete cascade,
  constraint automotive_work_order_items_service_belongs_to_tenant
    foreign key (source_service_id, tenant_id)
    references public.services (id, tenant_id)
    on delete restrict
);

create table public.automotive_work_order_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  kind public.automotive_payment_kind not null default 'payment',
  method public.automotive_payment_method not null,
  amount numeric(12, 2) not null,
  paid_at timestamptz not null default now(),
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint automotive_work_order_payments_amount_positive check (amount > 0),
  constraint automotive_work_order_payments_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete restrict
);

create table public.automotive_work_order_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  delivered_at timestamptz not null default now(),
  delivered_by uuid references auth.users (id) on delete set null,
  received_by_name text,
  notes text,
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (work_order_id),
  constraint automotive_work_order_deliveries_checklist_object check (
    jsonb_typeof(checklist) = 'object'
  ),
  constraint automotive_work_order_deliveries_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete restrict
);

create table public.automotive_work_order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  event_type text not null,
  previous_status public.automotive_work_order_status,
  next_status public.automotive_work_order_status,
  actor_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint automotive_work_order_events_type check (
    event_type in (
      'created',
      'item_added',
      'item_removed',
      'payment_recorded',
      'stage_changed',
      'box_assigned',
      'box_released',
      'delivered',
      'cancelled'
    )
  ),
  constraint automotive_work_order_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint automotive_work_order_events_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete cascade
);

create table public.automotive_work_order_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  work_order_id uuid not null,
  stage public.automotive_media_stage not null,
  storage_path text not null,
  caption text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, storage_path),
  constraint automotive_work_order_media_storage_path_length check (
    char_length(trim(storage_path)) between 1 and 1024
  ),
  constraint automotive_work_order_media_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete cascade
);

create index automotive_vehicles_tenant_customer_idx
  on public.automotive_vehicles (tenant_id, customer_id, make, model)
  where active;

create index automotive_boxes_tenant_order_idx
  on public.automotive_boxes (tenant_id, display_order, name)
  where active;

create index automotive_work_orders_patio_idx
  on public.automotive_work_orders (tenant_id, status, created_at)
  where status in ('awaiting_service', 'in_service', 'service_completed', 'awaiting_pickup');

create index automotive_work_orders_vehicle_idx
  on public.automotive_work_orders (tenant_id, vehicle_id, created_at desc);

create index automotive_work_order_items_order_idx
  on public.automotive_work_order_items (work_order_id, created_at);

create index automotive_work_order_payments_order_idx
  on public.automotive_work_order_payments (work_order_id, paid_at);

create index automotive_work_order_events_order_idx
  on public.automotive_work_order_events (work_order_id, occurred_at);

create index automotive_work_order_media_order_idx
  on public.automotive_work_order_media (work_order_id, stage, created_at);

create trigger automotive_vehicles_set_updated_at
before update on public.automotive_vehicles
for each row execute procedure public.set_updated_at();

create trigger automotive_boxes_set_updated_at
before update on public.automotive_boxes
for each row execute procedure public.set_updated_at();

create trigger automotive_work_orders_set_updated_at
before update on public.automotive_work_orders
for each row execute procedure public.set_updated_at();

create or replace function public.is_automotive_business(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses business
    where business.id = target_tenant_id
      and business.business_type = 'automotive_aesthetics'
      and business.active
  );
$$;

create or replace function public.is_tenant_finance_operator(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'manager', 'receptionist', 'cashier')
      and member.active
  );
$$;

create or replace function public.assert_automotive_business(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_automotive_business(target_tenant_id) then
    raise exception 'This operation requires an active Automotive business' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.next_automotive_work_order_number(target_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  insert into public.automotive_work_order_number_counters (tenant_id, next_number)
  values (target_tenant_id, 2)
  on conflict (tenant_id) do update
  set next_number = public.automotive_work_order_number_counters.next_number + 1
  returning next_number - 1 into v_number;

  return v_number;
end;
$$;

create or replace function public.create_automotive_box(
  p_tenant_id uuid,
  p_code text,
  p_name text,
  p_display_order integer default 0
)
returns public.automotive_boxes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_id uuid;
  v_box public.automotive_boxes;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can create Automotive boxes' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Box code and name are required' using errcode = '22023';
  end if;

  insert into public.scheduling_resources (tenant_id, kind, name)
  values (p_tenant_id, 'service_box', trim(p_name))
  returning id into v_resource_id;

  insert into public.automotive_boxes (
    tenant_id,
    scheduling_resource_id,
    code,
    name,
    display_order
  )
  values (
    p_tenant_id,
    v_resource_id,
    upper(trim(p_code)),
    trim(p_name),
    p_display_order
  )
  returning * into v_box;

  return v_box;
end;
$$;

create or replace function public.assign_automotive_work_order_box(
  p_work_order_id uuid,
  p_box_id uuid
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_box_resource_id uuid;
  v_reservation_id uuid;
  v_received_at timestamptz;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id) then
    raise exception 'Only a scheduler can assign an Automotive box' using errcode = '42501';
  end if;

  if v_work_order.status in ('delivered', 'cancelled') then
    raise exception 'A terminal work order cannot occupy a box' using errcode = '22023';
  end if;

  select box.scheduling_resource_id
  into v_box_resource_id
  from public.automotive_boxes box
  join public.scheduling_resources resource
    on resource.id = box.scheduling_resource_id
    and resource.tenant_id = box.tenant_id
  where box.id = p_box_id
    and box.tenant_id = v_work_order.tenant_id
    and box.active
    and resource.kind = 'service_box'
    and resource.active;

  if not found then
    raise exception 'Active Automotive box not found in this business' using errcode = 'P0001';
  end if;

  if v_work_order.assigned_box_id = p_box_id then
    return v_work_order;
  end if;

  select intake.received_at
  into v_received_at
  from public.automotive_work_order_intakes intake
  where intake.work_order_id = v_work_order.id;

  if not found then
    raise exception 'Work order intake not found' using errcode = 'P0001';
  end if;

  if v_work_order.box_reservation_id is not null then
    update public.automotive_work_orders work_order
    set assigned_box_id = null,
        box_reservation_id = null
    where work_order.id = v_work_order.id;

    delete from public.scheduling_resource_reservations
    where id = v_work_order.box_reservation_id
      and tenant_id = v_work_order.tenant_id;
  end if;

  insert into public.scheduling_resource_reservations (
    tenant_id,
    scheduling_resource_id,
    kind,
    start_at,
    end_at,
    reason,
    created_by
  )
  values (
    v_work_order.tenant_id,
    v_box_resource_id,
    'block',
    v_received_at,
    'infinity'::timestamptz,
    'automotive_work_order_box',
    (select auth.uid())
  )
  returning id into v_reservation_id;

  update public.automotive_work_orders work_order
  set assigned_box_id = p_box_id,
      box_reservation_id = v_reservation_id
  where work_order.id = v_work_order.id
  returning * into v_work_order;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'box_assigned',
    (select auth.uid()),
    jsonb_build_object('box_id', p_box_id)
  );

  return v_work_order;
end;
$$;

create or replace function public.release_automotive_work_order_box(
  p_work_order_id uuid
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_previous_box_id uuid;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id) then
    raise exception 'Only a scheduler can release an Automotive box' using errcode = '42501';
  end if;

  if v_work_order.box_reservation_id is null then
    return v_work_order;
  end if;

  v_previous_box_id := v_work_order.assigned_box_id;

  update public.automotive_work_orders work_order
  set assigned_box_id = null,
      box_reservation_id = null
  where work_order.id = v_work_order.id;

  delete from public.scheduling_resource_reservations
  where id = v_work_order.box_reservation_id
    and tenant_id = v_work_order.tenant_id;

  update public.automotive_work_orders work_order
  set assigned_box_id = null,
      box_reservation_id = null
  where work_order.id = v_work_order.id
  returning * into v_work_order;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'box_released',
    (select auth.uid()),
    jsonb_build_object('box_id', v_previous_box_id)
  );

  return v_work_order;
end;
$$;

create or replace function public.open_automotive_work_order(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_appointment_id uuid default null,
  p_box_id uuid default null,
  p_received_at timestamptz default now(),
  p_odometer integer default null,
  p_fuel_level smallint default null,
  p_condition_notes text default null,
  p_received_items text default null,
  p_checklist jsonb default '{}'::jsonb,
  p_notes text default null
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_appointment public.appointments;
  v_service public.services;
  v_number integer;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can open an Automotive work order' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if jsonb_typeof(coalesce(p_checklist, '{}'::jsonb)) <> 'object' then
    raise exception 'The intake checklist must be a JSON object' using errcode = '22023';
  end if;

  perform 1
  from public.customers customer
  where customer.id = p_customer_id
    and customer.tenant_id = p_tenant_id
    and customer.active;

  if not found then
    raise exception 'Active customer not found in this business' using errcode = 'P0001';
  end if;

  perform 1
  from public.automotive_vehicles vehicle
  where vehicle.id = p_vehicle_id
    and vehicle.tenant_id = p_tenant_id
    and vehicle.customer_id = p_customer_id
    and vehicle.active;

  if not found then
    raise exception 'Active vehicle not found for this customer' using errcode = 'P0001';
  end if;

  if p_appointment_id is not null then
    select *
    into v_appointment
    from public.appointments appointment
    where appointment.id = p_appointment_id
      and appointment.tenant_id = p_tenant_id
      and appointment.customer_id = p_customer_id
      and appointment.status in ('scheduled', 'confirmed', 'in_progress')
    for key share;

    if not found then
      raise exception 'Active appointment not found for this customer' using errcode = 'P0001';
    end if;

    select *
    into v_service
    from public.services service
    where service.id = v_appointment.service_id
      and service.tenant_id = p_tenant_id;
  end if;

  v_number := public.next_automotive_work_order_number(p_tenant_id);

  insert into public.automotive_work_orders (
    tenant_id,
    number,
    customer_id,
    vehicle_id,
    appointment_id,
    assigned_professional_id,
    status,
    notes,
    created_by
  )
  values (
    p_tenant_id,
    v_number,
    p_customer_id,
    p_vehicle_id,
    p_appointment_id,
    v_appointment.professional_id,
    'awaiting_service',
    p_notes,
    (select auth.uid())
  )
  returning * into v_work_order;

  insert into public.automotive_work_order_intakes (
    tenant_id,
    work_order_id,
    odometer,
    fuel_level,
    condition_notes,
    received_items,
    checklist,
    received_at,
    received_by
  )
  values (
    p_tenant_id,
    v_work_order.id,
    p_odometer,
    p_fuel_level,
    p_condition_notes,
    p_received_items,
    coalesce(p_checklist, '{}'::jsonb),
    p_received_at,
    (select auth.uid())
  );

  if p_appointment_id is not null then
    insert into public.automotive_work_order_items (
      tenant_id,
      work_order_id,
      source_service_id,
      kind,
      description,
      quantity,
      unit_price,
      created_by
    )
    values (
      p_tenant_id,
      v_work_order.id,
      v_service.id,
      'service',
      v_service.name,
      1,
      v_service.base_price,
      (select auth.uid())
    );
  end if;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    next_status,
    actor_user_id,
    metadata
  )
  values (
    p_tenant_id,
    v_work_order.id,
    'created',
    'awaiting_service',
    (select auth.uid()),
    jsonb_build_object(
      'number', v_number,
      'appointment_id', p_appointment_id,
      'vehicle_id', p_vehicle_id
    )
  );

  if p_box_id is not null then
    if p_appointment_id is not null then
      delete from public.scheduling_resource_reservations reservation
      using public.scheduling_resources resource
      where reservation.appointment_id = p_appointment_id
        and reservation.scheduling_resource_id = resource.id
        and reservation.tenant_id = resource.tenant_id
        and resource.kind = 'service_box';
    end if;

    v_work_order := public.assign_automotive_work_order_box(v_work_order.id, p_box_id);
  end if;

  return v_work_order;
end;
$$;

create or replace function public.add_automotive_work_order_item(
  p_work_order_id uuid,
  p_kind public.automotive_work_order_item_kind,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_source_service_id uuid default null
)
returns public.automotive_work_order_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_item public.automotive_work_order_items;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id) then
    raise exception 'Only a scheduler can add work-order items' using errcode = '42501';
  end if;

  if v_work_order.status not in ('awaiting_service', 'in_service', 'service_completed') then
    raise exception 'Items cannot be changed at this work-order stage' using errcode = '22023';
  end if;

  if p_source_service_id is not null then
    perform 1
    from public.services service
    where service.id = p_source_service_id
      and service.tenant_id = v_work_order.tenant_id;

    if not found then
      raise exception 'Source service not found in this business' using errcode = 'P0001';
    end if;
  end if;

  insert into public.automotive_work_order_items (
    tenant_id,
    work_order_id,
    source_service_id,
    kind,
    description,
    quantity,
    unit_price,
    created_by
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    p_source_service_id,
    p_kind,
    p_description,
    p_quantity,
    p_unit_price,
    (select auth.uid())
  )
  returning * into v_item;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'item_added',
    (select auth.uid()),
    jsonb_build_object('item_id', v_item.id, 'kind', p_kind)
  );

  return v_item;
end;
$$;

create or replace function public.remove_automotive_work_order_item(
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.automotive_work_order_items;
  v_status public.automotive_work_order_status;
begin
  select item.*
  into v_item
  from public.automotive_work_order_items item
  join public.automotive_work_orders work_order
    on work_order.id = item.work_order_id
    and work_order.tenant_id = item.tenant_id
  where item.id = p_item_id
  for update of item, work_order;

  if not found then
    raise exception 'Automotive work-order item not found' using errcode = 'P0001';
  end if;

  select work_order.status
  into v_status
  from public.automotive_work_orders work_order
  where work_order.id = v_item.work_order_id
    and work_order.tenant_id = v_item.tenant_id;

  if not public.is_tenant_scheduler(v_item.tenant_id) then
    raise exception 'Only a scheduler can remove work-order items' using errcode = '42501';
  end if;

  if v_status not in ('awaiting_service', 'in_service', 'service_completed') then
    raise exception 'Items cannot be changed at this work-order stage' using errcode = '22023';
  end if;

  delete from public.automotive_work_order_items
  where id = v_item.id;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_item.tenant_id,
    v_item.work_order_id,
    'item_removed',
    (select auth.uid()),
    jsonb_build_object('item_id', v_item.id)
  );
end;
$$;

create or replace function public.record_automotive_work_order_payment(
  p_work_order_id uuid,
  p_kind public.automotive_payment_kind,
  p_method public.automotive_payment_method,
  p_amount numeric,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns public.automotive_work_order_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_payment public.automotive_work_order_payments;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_finance_operator(v_work_order.tenant_id) then
    raise exception 'Only a finance operator can record payments' using errcode = '42501';
  end if;

  if v_work_order.status = 'cancelled' then
    raise exception 'Payments cannot be recorded for a cancelled work order' using errcode = '22023';
  end if;

  insert into public.automotive_work_order_payments (
    tenant_id,
    work_order_id,
    kind,
    method,
    amount,
    paid_at,
    notes,
    recorded_by
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    p_kind,
    p_method,
    p_amount,
    p_paid_at,
    p_notes,
    (select auth.uid())
  )
  returning * into v_payment;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'payment_recorded',
    (select auth.uid()),
    jsonb_build_object(
      'payment_id', v_payment.id,
      'kind', p_kind,
      'amount', p_amount,
      'method', p_method
    )
  );

  return v_payment;
end;
$$;

create or replace function public.transition_automotive_work_order(
  p_work_order_id uuid,
  p_next_status public.automotive_work_order_status
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_previous_status public.automotive_work_order_status;
  v_previous_box_reservation_id uuid;
  v_event_type text;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id)
    and not (
      p_next_status in ('in_service', 'service_completed')
      and v_work_order.assigned_professional_id is not null
      and public.is_current_user_professional(
        v_work_order.assigned_professional_id,
        v_work_order.tenant_id
      )
    ) then
    raise exception 'You cannot change this Automotive work-order stage' using errcode = '42501';
  end if;

  if (v_work_order.status = 'awaiting_service' and p_next_status not in ('in_service', 'cancelled'))
    or (v_work_order.status = 'in_service' and p_next_status not in ('service_completed', 'cancelled'))
    or (v_work_order.status = 'service_completed' and p_next_status not in ('awaiting_pickup', 'cancelled'))
    or v_work_order.status in ('awaiting_pickup', 'delivered', 'cancelled') then
    raise exception 'Invalid Automotive work-order stage transition' using errcode = '22023';
  end if;

  v_previous_status := v_work_order.status;
  v_previous_box_reservation_id := v_work_order.box_reservation_id;
  v_event_type := case p_next_status
    when 'cancelled' then 'cancelled'
    else 'stage_changed'
  end;

  if p_next_status = 'cancelled' and v_work_order.box_reservation_id is not null then
    update public.automotive_work_orders work_order
    set assigned_box_id = null,
        box_reservation_id = null,
        status = p_next_status
    where work_order.id = v_work_order.id
    returning * into v_work_order;

    delete from public.scheduling_resource_reservations
    where id = v_previous_box_reservation_id
      and tenant_id = v_work_order.tenant_id;
  else
    update public.automotive_work_orders work_order
    set status = p_next_status
    where work_order.id = v_work_order.id
    returning * into v_work_order;
  end if;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    previous_status,
    next_status,
    actor_user_id
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    v_event_type,
    v_previous_status,
    p_next_status,
    (select auth.uid())
  );

  return v_work_order;
end;
$$;

create or replace function public.deliver_automotive_work_order(
  p_work_order_id uuid,
  p_delivered_at timestamptz default now(),
  p_received_by_name text default null,
  p_notes text default null,
  p_checklist jsonb default '{}'::jsonb
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for update;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id) then
    raise exception 'Only a scheduler can deliver an Automotive work order' using errcode = '42501';
  end if;

  if v_work_order.status <> 'awaiting_pickup' then
    raise exception 'Only a work order awaiting pickup can be delivered' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_checklist, '{}'::jsonb)) <> 'object' then
    raise exception 'The delivery checklist must be a JSON object' using errcode = '22023';
  end if;

  insert into public.automotive_work_order_deliveries (
    tenant_id,
    work_order_id,
    delivered_at,
    delivered_by,
    received_by_name,
    notes,
    checklist
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    p_delivered_at,
    (select auth.uid()),
    nullif(trim(p_received_by_name), ''),
    p_notes,
    coalesce(p_checklist, '{}'::jsonb)
  );

  if v_work_order.box_reservation_id is not null then
    update public.automotive_work_orders work_order
    set assigned_box_id = null,
        box_reservation_id = null
    where work_order.id = v_work_order.id;

    delete from public.scheduling_resource_reservations
    where id = v_work_order.box_reservation_id
      and tenant_id = v_work_order.tenant_id;
  end if;

  update public.automotive_work_orders work_order
  set assigned_box_id = null,
      box_reservation_id = null,
      status = 'delivered'
  where work_order.id = v_work_order.id
  returning * into v_work_order;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    previous_status,
    next_status,
    actor_user_id
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'delivered',
    'awaiting_pickup',
    'delivered',
    (select auth.uid())
  );

  return v_work_order;
end;
$$;

revoke all on function public.is_automotive_business(uuid) from public;
revoke all on function public.is_tenant_finance_operator(uuid) from public;
revoke all on function public.assert_automotive_business(uuid) from public;
revoke all on function public.next_automotive_work_order_number(uuid) from public;
revoke all on function public.create_automotive_box(uuid, text, text, integer) from public;
revoke all on function public.assign_automotive_work_order_box(uuid, uuid) from public;
revoke all on function public.release_automotive_work_order_box(uuid) from public;
revoke all on function public.open_automotive_work_order(uuid, uuid, uuid, uuid, uuid, timestamptz, integer, smallint, text, text, jsonb, text) from public;
revoke all on function public.add_automotive_work_order_item(uuid, public.automotive_work_order_item_kind, text, numeric, numeric, uuid) from public;
revoke all on function public.remove_automotive_work_order_item(uuid) from public;
revoke all on function public.record_automotive_work_order_payment(uuid, public.automotive_payment_kind, public.automotive_payment_method, numeric, timestamptz, text) from public;
revoke all on function public.transition_automotive_work_order(uuid, public.automotive_work_order_status) from public;
revoke all on function public.deliver_automotive_work_order(uuid, timestamptz, text, text, jsonb) from public;

grant execute on function public.is_automotive_business(uuid) to authenticated;
grant execute on function public.create_automotive_box(uuid, text, text, integer) to authenticated;
grant execute on function public.assign_automotive_work_order_box(uuid, uuid) to authenticated;
grant execute on function public.release_automotive_work_order_box(uuid) to authenticated;
grant execute on function public.open_automotive_work_order(uuid, uuid, uuid, uuid, uuid, timestamptz, integer, smallint, text, text, jsonb, text) to authenticated;
grant execute on function public.add_automotive_work_order_item(uuid, public.automotive_work_order_item_kind, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.remove_automotive_work_order_item(uuid) to authenticated;
grant execute on function public.record_automotive_work_order_payment(uuid, public.automotive_payment_kind, public.automotive_payment_method, numeric, timestamptz, text) to authenticated;
grant execute on function public.transition_automotive_work_order(uuid, public.automotive_work_order_status) to authenticated;
grant execute on function public.deliver_automotive_work_order(uuid, timestamptz, text, text, jsonb) to authenticated;

alter table public.automotive_vehicles enable row level security;
alter table public.automotive_boxes enable row level security;
alter table public.automotive_work_order_number_counters enable row level security;
alter table public.automotive_work_orders enable row level security;
alter table public.automotive_work_order_intakes enable row level security;
alter table public.automotive_work_order_items enable row level security;
alter table public.automotive_work_order_payments enable row level security;
alter table public.automotive_work_order_deliveries enable row level security;
alter table public.automotive_work_order_events enable row level security;
alter table public.automotive_work_order_media enable row level security;

revoke all on public.automotive_vehicles from anon, authenticated;
revoke all on public.automotive_boxes from anon, authenticated;
revoke all on public.automotive_work_order_number_counters from anon, authenticated;
revoke all on public.automotive_work_orders from anon, authenticated;
revoke all on public.automotive_work_order_intakes from anon, authenticated;
revoke all on public.automotive_work_order_items from anon, authenticated;
revoke all on public.automotive_work_order_payments from anon, authenticated;
revoke all on public.automotive_work_order_deliveries from anon, authenticated;
revoke all on public.automotive_work_order_events from anon, authenticated;
revoke all on public.automotive_work_order_media from anon, authenticated;

grant select, insert, update, delete on public.automotive_vehicles to authenticated;
grant select on public.automotive_boxes to authenticated;
grant select on public.automotive_work_orders to authenticated;
grant select on public.automotive_work_order_intakes to authenticated;
grant select on public.automotive_work_order_items to authenticated;
grant select on public.automotive_work_order_payments to authenticated;
grant select on public.automotive_work_order_deliveries to authenticated;
grant select on public.automotive_work_order_events to authenticated;
grant select, insert, delete on public.automotive_work_order_media to authenticated;

create policy automotive_vehicles_select_member
on public.automotive_vehicles for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_vehicles_manage_scheduler
on public.automotive_vehicles for all to authenticated
using (
  public.is_automotive_business(tenant_id)
  and public.is_tenant_scheduler(tenant_id)
)
with check (
  public.is_automotive_business(tenant_id)
  and public.is_tenant_scheduler(tenant_id)
);

create policy automotive_boxes_select_member
on public.automotive_boxes for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_orders_select_member
on public.automotive_work_orders for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_intakes_select_member
on public.automotive_work_order_intakes for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_items_select_member
on public.automotive_work_order_items for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_payments_select_member
on public.automotive_work_order_payments for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_deliveries_select_member
on public.automotive_work_order_deliveries for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_events_select_member
on public.automotive_work_order_events for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_media_select_member
on public.automotive_work_order_media for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_work_order_media_insert_scheduler_or_assignee
on public.automotive_work_order_media for insert to authenticated
with check (
  public.is_tenant_scheduler(tenant_id)
  or exists (
    select 1
    from public.automotive_work_orders work_order
    where work_order.id = automotive_work_order_media.work_order_id
      and work_order.tenant_id = automotive_work_order_media.tenant_id
      and work_order.assigned_professional_id is not null
      and public.is_current_user_professional(
        work_order.assigned_professional_id,
        work_order.tenant_id
      )
  )
);

create policy automotive_work_order_media_delete_scheduler_or_assignee
on public.automotive_work_order_media for delete to authenticated
using (
  public.is_tenant_scheduler(tenant_id)
  or exists (
    select 1
    from public.automotive_work_orders work_order
    where work_order.id = automotive_work_order_media.work_order_id
      and work_order.tenant_id = automotive_work_order_media.tenant_id
      and work_order.assigned_professional_id is not null
      and public.is_current_user_professional(
        work_order.assigned_professional_id,
        work_order.tenant_id
      )
  )
);

create or replace view public.automotive_patio
with (security_invoker = true)
as
with item_totals as (
  select
    item.work_order_id,
    sum(item.line_total) as total_amount
  from public.automotive_work_order_items item
  group by item.work_order_id
), payment_totals as (
  select
    payment.work_order_id,
    sum(case payment.kind when 'payment' then payment.amount else -payment.amount end) as paid_amount
  from public.automotive_work_order_payments payment
  group by payment.work_order_id
)
select
  work_order.id,
  work_order.tenant_id,
  work_order.number,
  work_order.status,
  work_order.created_at,
  intake.received_at,
  customer.id as customer_id,
  customer.name as customer_name,
  vehicle.id as vehicle_id,
  vehicle.license_plate,
  vehicle.normalized_license_plate,
  vehicle.make,
  vehicle.model,
  vehicle.color,
  professional.id as professional_id,
  professional.name as professional_name,
  box.id as box_id,
  box.code as box_code,
  box.name as box_name,
  coalesce(item_totals.total_amount, 0)::numeric(12, 2) as total_amount,
  coalesce(payment_totals.paid_amount, 0)::numeric(12, 2) as paid_amount,
  (coalesce(item_totals.total_amount, 0) - coalesce(payment_totals.paid_amount, 0))::numeric(12, 2) as outstanding_amount,
  case
    when coalesce(item_totals.total_amount, 0) <= 0 then 'paid'
    when coalesce(payment_totals.paid_amount, 0) >= coalesce(item_totals.total_amount, 0) then 'paid'
    when coalesce(payment_totals.paid_amount, 0) > 0 then 'partial'
    else 'unpaid'
  end as payment_status
from public.automotive_work_orders work_order
join public.automotive_work_order_intakes intake
  on intake.work_order_id = work_order.id
  and intake.tenant_id = work_order.tenant_id
join public.customers customer
  on customer.id = work_order.customer_id
  and customer.tenant_id = work_order.tenant_id
join public.automotive_vehicles vehicle
  on vehicle.id = work_order.vehicle_id
  and vehicle.tenant_id = work_order.tenant_id
left join public.professionals professional
  on professional.id = work_order.assigned_professional_id
  and professional.tenant_id = work_order.tenant_id
left join public.automotive_boxes box
  on box.id = work_order.assigned_box_id
  and box.tenant_id = work_order.tenant_id
left join item_totals
  on item_totals.work_order_id = work_order.id
left join payment_totals
  on payment_totals.work_order_id = work_order.id
where work_order.status in ('awaiting_service', 'in_service', 'service_completed', 'awaiting_pickup');

revoke all on public.automotive_patio from anon, authenticated;
grant select on public.automotive_patio to authenticated;
