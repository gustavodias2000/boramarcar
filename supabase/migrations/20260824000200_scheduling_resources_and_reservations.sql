-- Agenda com capacidade exclusiva e reserva transacional.
-- A mesma abstração atende profissionais agora e boxes no módulo Automotive.

create extension if not exists btree_gist;

create type public.scheduling_resource_kind as enum (
  'professional',
  'service_box'
);

create type public.scheduling_reservation_kind as enum (
  'appointment',
  'block'
);

-- The shared appointment id is already globally unique. This additional key
-- allows later relations to enforce that their appointment belongs to the
-- same tenant without relying on application code.
alter table public.appointments
  add constraint appointments_id_tenant_key unique (id, tenant_id);

create table public.scheduling_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  kind public.scheduling_resource_kind not null,
  professional_id uuid,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, professional_id),
  constraint scheduling_resources_name_length check (char_length(trim(name)) between 1 and 160),
  constraint scheduling_resources_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict,
  constraint scheduling_resources_kind_binding check (
    (kind = 'professional' and professional_id is not null)
    or (kind = 'service_box' and professional_id is null)
  )
);

create table public.professional_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid not null,
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, professional_id, weekday, starts_at, ends_at),
  constraint professional_schedule_rules_weekday check (weekday between 0 and 6),
  constraint professional_schedule_rules_valid_period check (ends_at > starts_at),
  constraint professional_schedule_rules_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete cascade
);

create table public.scheduling_resource_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  scheduling_resource_id uuid not null,
  appointment_id uuid,
  kind public.scheduling_reservation_kind not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint scheduling_resource_reservations_valid_period check (end_at > start_at),
  constraint scheduling_resource_reservations_source check (
    (kind = 'appointment' and appointment_id is not null)
    or (kind = 'block' and appointment_id is null)
  ),
  constraint scheduling_resource_reservations_resource_belongs_to_tenant
    foreign key (scheduling_resource_id, tenant_id)
    references public.scheduling_resources (id, tenant_id)
    on delete restrict,
  constraint scheduling_resource_reservations_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete cascade,
  constraint scheduling_resource_reservations_no_overlap
    exclude using gist (
      scheduling_resource_id with =,
      tstzrange(start_at, end_at, '[)') with &&
    )
);

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null,
  event_type text not null,
  previous_status public.appointment_status,
  next_status public.appointment_status,
  actor_user_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint appointment_events_type check (
    event_type in ('created', 'rescheduled', 'confirmed', 'started', 'completed', 'cancelled')
  ),
  constraint appointment_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint appointment_events_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete cascade
);

create index scheduling_resources_tenant_active_idx
  on public.scheduling_resources (tenant_id, kind, name)
  where active;

create index professional_schedule_rules_lookup_idx
  on public.professional_schedule_rules (tenant_id, professional_id, weekday, starts_at, ends_at)
  where active;

create index scheduling_resource_reservations_tenant_period_idx
  on public.scheduling_resource_reservations (tenant_id, start_at, end_at);

create index scheduling_resource_reservations_appointment_idx
  on public.scheduling_resource_reservations (appointment_id)
  where appointment_id is not null;

create index appointment_events_appointment_occurred_idx
  on public.appointment_events (appointment_id, occurred_at);

create trigger scheduling_resources_set_updated_at
before update on public.scheduling_resources
for each row execute procedure public.set_updated_at();

create trigger professional_schedule_rules_set_updated_at
before update on public.professional_schedule_rules
for each row execute procedure public.set_updated_at();

create or replace function public.sync_professional_scheduling_resource()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scheduling_resources (
    tenant_id,
    kind,
    professional_id,
    name,
    active
  )
  values (
    new.tenant_id,
    'professional',
    new.id,
    new.name,
    new.active
  )
  on conflict (tenant_id, professional_id) do update
  set name = excluded.name,
      active = excluded.active;

  return new;
end;
$$;

create trigger professionals_sync_scheduling_resource
after insert or update of name, active on public.professionals
for each row execute procedure public.sync_professional_scheduling_resource();

-- Existing professionals also become reservable resources when this migration is applied.
insert into public.scheduling_resources (tenant_id, kind, professional_id, name, active)
select tenant_id, 'professional', id, name, active
from public.professionals
on conflict (tenant_id, professional_id) do update
set name = excluded.name,
    active = excluded.active;

create or replace function public.is_tenant_scheduler(target_tenant_id uuid)
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
      and member.role in ('owner', 'manager', 'receptionist')
      and member.active
  );
$$;

create or replace function public.is_current_user_professional(
  target_professional_id uuid,
  target_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professionals professional
    join public.business_members member
      on member.id = professional.business_member_id
      and member.tenant_id = professional.tenant_id
    where professional.id = target_professional_id
      and professional.tenant_id = target_tenant_id
      and professional.active
      and member.user_id = (select auth.uid())
      and member.active
  );
$$;

-- Returns the professional resource only when the requested interval is valid
-- in the business timezone and is not explicitly blocked.
create or replace function public.require_available_professional_resource(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_id uuid;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'The reservation interval must have a positive duration' using errcode = '22023';
  end if;

  select business.timezone
  into v_timezone
  from public.businesses business
  where business.id = p_tenant_id
    and business.active;

  if not found then
    raise exception 'Active business not found' using errcode = 'P0001';
  end if;

  select resource.id
  into v_resource_id
  from public.scheduling_resources resource
  join public.professionals professional
    on professional.id = resource.professional_id
    and professional.tenant_id = resource.tenant_id
  where resource.tenant_id = p_tenant_id
    and resource.kind = 'professional'
    and resource.professional_id = p_professional_id
    and resource.active
    and professional.active;

  if not found then
    raise exception 'Active professional resource not found' using errcode = 'P0001';
  end if;

  v_local_start := p_start_at at time zone v_timezone;
  v_local_end := p_end_at at time zone v_timezone;

  if v_local_start::date <> v_local_end::date then
    raise exception 'An appointment cannot span two local business days' using errcode = '22023';
  end if;

  v_weekday := extract(dow from v_local_start)::smallint;

  if not exists (
    select 1
    from public.professional_schedule_rules rule
    where rule.tenant_id = p_tenant_id
      and rule.professional_id = p_professional_id
      and rule.weekday = v_weekday
      and rule.active
      and rule.starts_at <= v_local_start::time
      and rule.ends_at >= v_local_end::time
  ) then
    raise exception 'Professional is unavailable for the requested interval' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.scheduling_resource_reservations reservation
    where reservation.scheduling_resource_id = v_resource_id
      and reservation.kind = 'block'
      and tstzrange(reservation.start_at, reservation.end_at, '[)')
          && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    raise exception 'The requested interval is blocked' using errcode = 'P0001';
  end if;

  return v_resource_id;
end;
$$;

create or replace function public.create_staff_appointment(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz,
  p_notes text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_minutes integer;
  v_end_at timestamptz;
  v_resource_id uuid;
  v_appointment public.appointments;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can create appointments' using errcode = '42501';
  end if;

  perform 1
  from public.customers customer
  where customer.id = p_customer_id
    and customer.tenant_id = p_tenant_id
    and customer.active;

  if not found then
    raise exception 'Active customer not found in this business' using errcode = 'P0001';
  end if;

  select service.duration_minutes
  into v_duration_minutes
  from public.services service
  where service.id = p_service_id
    and service.tenant_id = p_tenant_id
    and service.active;

  if not found then
    raise exception 'Active service not found in this business' using errcode = 'P0001';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_duration_minutes);
  v_resource_id := public.require_available_professional_resource(
    p_tenant_id,
    p_professional_id,
    p_start_at,
    v_end_at
  );

  insert into public.appointments (
    tenant_id,
    customer_id,
    service_id,
    professional_id,
    start_at,
    end_at,
    status,
    notes,
    created_by
  )
  values (
    p_tenant_id,
    p_customer_id,
    p_service_id,
    p_professional_id,
    p_start_at,
    v_end_at,
    'scheduled',
    p_notes,
    (select auth.uid())
  )
  returning * into v_appointment;

  insert into public.scheduling_resource_reservations (
    tenant_id,
    scheduling_resource_id,
    appointment_id,
    kind,
    start_at,
    end_at,
    created_by
  )
  values (
    p_tenant_id,
    v_resource_id,
    v_appointment.id,
    'appointment',
    p_start_at,
    v_end_at,
    (select auth.uid())
  );

  insert into public.appointment_events (
    tenant_id,
    appointment_id,
    event_type,
    next_status,
    actor_user_id,
    metadata
  )
  values (
    p_tenant_id,
    v_appointment.id,
    'created',
    'scheduled',
    (select auth.uid()),
    jsonb_build_object(
      'service_id', p_service_id,
      'professional_id', p_professional_id
    )
  );

  return v_appointment;
end;
$$;

create or replace function public.reschedule_staff_appointment(
  p_appointment_id uuid,
  p_start_at timestamptz
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_end_at timestamptz;
  v_resource_id uuid;
begin
  select *
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_appointment.tenant_id) then
    raise exception 'Only a scheduler can reschedule appointments' using errcode = '42501';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed') then
    raise exception 'Only scheduled or confirmed appointments can be rescheduled' using errcode = 'P0001';
  end if;

  v_end_at := p_start_at + (v_appointment.end_at - v_appointment.start_at);
  v_resource_id := public.require_available_professional_resource(
    v_appointment.tenant_id,
    v_appointment.professional_id,
    p_start_at,
    v_end_at
  );

  update public.scheduling_resource_reservations reservation
  set scheduling_resource_id = v_resource_id,
      start_at = p_start_at,
      end_at = v_end_at
  where reservation.appointment_id = v_appointment.id
    and reservation.kind = 'appointment';

  if not found then
    raise exception 'Appointment reservation not found' using errcode = 'P0001';
  end if;

  update public.appointments appointment
  set start_at = p_start_at,
      end_at = v_end_at
  where appointment.id = v_appointment.id
  returning * into v_appointment;

  insert into public.appointment_events (
    tenant_id,
    appointment_id,
    event_type,
    previous_status,
    next_status,
    actor_user_id,
    metadata
  )
  values (
    v_appointment.tenant_id,
    v_appointment.id,
    'rescheduled',
    v_appointment.status,
    v_appointment.status,
    (select auth.uid()),
    jsonb_build_object('start_at', p_start_at, 'end_at', v_end_at)
  );

  return v_appointment;
end;
$$;

create or replace function public.transition_staff_appointment(
  p_appointment_id uuid,
  p_next_status public.appointment_status
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_event_type text;
begin
  select *
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_appointment.tenant_id)
    and not (
      p_next_status in ('in_progress', 'completed')
      and public.is_current_user_professional(
        v_appointment.professional_id,
        v_appointment.tenant_id
      )
    ) then
    raise exception 'You cannot change this appointment status' using errcode = '42501';
  end if;

  if (v_appointment.status = 'scheduled' and p_next_status not in ('confirmed', 'cancelled'))
    or (v_appointment.status = 'confirmed' and p_next_status not in ('in_progress', 'cancelled'))
    or (v_appointment.status = 'in_progress' and p_next_status not in ('completed', 'cancelled'))
    or v_appointment.status in ('completed', 'cancelled') then
    raise exception 'Invalid appointment status transition' using errcode = '22023';
  end if;

  v_event_type := case p_next_status
    when 'confirmed' then 'confirmed'
    when 'in_progress' then 'started'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
  end;

  update public.appointments appointment
  set status = p_next_status
  where appointment.id = v_appointment.id
  returning * into v_appointment;

  if p_next_status in ('completed', 'cancelled') then
    delete from public.scheduling_resource_reservations reservation
    where reservation.appointment_id = v_appointment.id
      and reservation.kind = 'appointment';
  end if;

  insert into public.appointment_events (
    tenant_id,
    appointment_id,
    event_type,
    previous_status,
    next_status,
    actor_user_id
  )
  values (
    v_appointment.tenant_id,
    v_appointment.id,
    v_event_type,
    nullif(v_appointment.status, p_next_status),
    p_next_status,
    (select auth.uid())
  );

  return v_appointment;
end;
$$;

create or replace function public.create_scheduling_block(
  p_scheduling_resource_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_professional_id uuid;
  v_reservation_id uuid;
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'The block interval must have a positive duration' using errcode = '22023';
  end if;

  select resource.tenant_id, resource.professional_id
  into v_tenant_id, v_professional_id
  from public.scheduling_resources resource
  where resource.id = p_scheduling_resource_id
    and resource.active;

  if not found then
    raise exception 'Active scheduling resource not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_tenant_id)
    and not (
      v_professional_id is not null
      and public.is_current_user_professional(v_professional_id, v_tenant_id)
    ) then
    raise exception 'You cannot block this scheduling resource' using errcode = '42501';
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
    v_tenant_id,
    p_scheduling_resource_id,
    'block',
    p_start_at,
    p_end_at,
    p_reason,
    (select auth.uid())
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.remove_scheduling_block(
  p_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_professional_id uuid;
begin
  select reservation.tenant_id, resource.professional_id
  into v_tenant_id, v_professional_id
  from public.scheduling_resource_reservations reservation
  join public.scheduling_resources resource
    on resource.id = reservation.scheduling_resource_id
    and resource.tenant_id = reservation.tenant_id
  where reservation.id = p_reservation_id
    and reservation.kind = 'block'
  for update;

  if not found then
    raise exception 'Scheduling block not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_tenant_id)
    and not (
      v_professional_id is not null
      and public.is_current_user_professional(v_professional_id, v_tenant_id)
    ) then
    raise exception 'You cannot remove this scheduling block' using errcode = '42501';
  end if;

  delete from public.scheduling_resource_reservations
  where id = p_reservation_id;
end;
$$;

revoke all on function public.sync_professional_scheduling_resource() from public;
revoke all on function public.is_tenant_scheduler(uuid) from public;
revoke all on function public.is_current_user_professional(uuid, uuid) from public;
revoke all on function public.require_available_professional_resource(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.create_staff_appointment(uuid, uuid, uuid, uuid, timestamptz, text) from public;
revoke all on function public.reschedule_staff_appointment(uuid, timestamptz) from public;
revoke all on function public.transition_staff_appointment(uuid, public.appointment_status) from public;
revoke all on function public.create_scheduling_block(uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.remove_scheduling_block(uuid) from public;

grant execute on function public.is_tenant_scheduler(uuid) to authenticated;
grant execute on function public.is_current_user_professional(uuid, uuid) to authenticated;
grant execute on function public.create_staff_appointment(uuid, uuid, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.reschedule_staff_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.transition_staff_appointment(uuid, public.appointment_status) to authenticated;
grant execute on function public.create_scheduling_block(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.remove_scheduling_block(uuid) to authenticated;

alter table public.scheduling_resources enable row level security;
alter table public.professional_schedule_rules enable row level security;
alter table public.scheduling_resource_reservations enable row level security;
alter table public.appointment_events enable row level security;

revoke all on public.scheduling_resources from anon, authenticated;
revoke all on public.scheduling_resource_reservations from anon, authenticated;
revoke all on public.appointment_events from anon, authenticated;
revoke insert, update, delete on public.appointments from authenticated;

grant select on public.scheduling_resources to authenticated;
grant select, insert, update, delete on public.professional_schedule_rules to authenticated;
grant select on public.scheduling_resource_reservations to authenticated;
grant select on public.appointment_events to authenticated;
grant select on public.appointments to authenticated;

create policy scheduling_resources_select_member
on public.scheduling_resources for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy professional_schedule_rules_select_member
on public.professional_schedule_rules for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy professional_schedule_rules_manage_scheduler_or_self
on public.professional_schedule_rules for all to authenticated
using (
  public.is_tenant_scheduler(tenant_id)
  or public.is_current_user_professional(professional_id, tenant_id)
)
with check (
  public.is_tenant_scheduler(tenant_id)
  or public.is_current_user_professional(professional_id, tenant_id)
);

create policy scheduling_resource_reservations_select_member
on public.scheduling_resource_reservations for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy appointment_events_select_member
on public.appointment_events for select to authenticated
using (public.is_active_business_member(tenant_id));

-- Appointment writes now go through the transaction functions above. This
-- prevents a client from bypassing capacity reservation or status validation.
drop policy if exists appointments_insert_operational_roles on public.appointments;
drop policy if exists appointments_update_operational_roles on public.appointments;
drop policy if exists appointments_delete_administrator on public.appointments;
