-- Reserve Automotive boxes for scheduled appointments and keep those
-- reservations intact when an appointment is rescheduled.

create or replace function public.assign_automotive_appointment_box(
  p_appointment_id uuid,
  p_box_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_box_resource_id uuid;
  v_existing_reservation_id uuid;
  v_existing_resource_id uuid;
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
    raise exception 'Only a scheduler can reserve an Automotive box' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(v_appointment.tenant_id);

  if v_appointment.status not in ('scheduled', 'confirmed') then
    raise exception 'Only scheduled or confirmed appointments can reserve a box' using errcode = '22023';
  end if;

  select box.scheduling_resource_id
  into v_box_resource_id
  from public.automotive_boxes box
  join public.scheduling_resources resource
    on resource.id = box.scheduling_resource_id
    and resource.tenant_id = box.tenant_id
  where box.id = p_box_id
    and box.tenant_id = v_appointment.tenant_id
    and box.active
    and resource.kind = 'service_box'
    and resource.active;

  if not found then
    raise exception 'Active Automotive box not found in this business' using errcode = 'P0001';
  end if;

  select reservation.id, reservation.scheduling_resource_id
  into v_existing_reservation_id, v_existing_resource_id
  from public.scheduling_resource_reservations reservation
  join public.scheduling_resources resource
    on resource.id = reservation.scheduling_resource_id
    and resource.tenant_id = reservation.tenant_id
  where reservation.appointment_id = v_appointment.id
    and reservation.kind = 'appointment'
    and resource.kind = 'service_box'
  for update of reservation;

  if found and v_existing_resource_id = v_box_resource_id then
    return;
  end if;

  if v_existing_reservation_id is not null then
    delete from public.scheduling_resource_reservations
    where id = v_existing_reservation_id
      and tenant_id = v_appointment.tenant_id;
  end if;

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
    v_appointment.tenant_id,
    v_box_resource_id,
    v_appointment.id,
    'appointment',
    v_appointment.start_at,
    v_appointment.end_at,
    (select auth.uid())
  );
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
  from public.scheduling_resources resource
  where reservation.appointment_id = v_appointment.id
    and reservation.kind = 'appointment'
    and reservation.scheduling_resource_id = resource.id
    and reservation.tenant_id = resource.tenant_id
    and resource.kind = 'professional';

  if not found then
    raise exception 'Appointment professional reservation not found' using errcode = 'P0001';
  end if;

  update public.scheduling_resource_reservations reservation
  set start_at = p_start_at,
      end_at = v_end_at
  from public.scheduling_resources resource
  where reservation.appointment_id = v_appointment.id
    and reservation.kind = 'appointment'
    and reservation.scheduling_resource_id = resource.id
    and reservation.tenant_id = resource.tenant_id
    and resource.kind = 'service_box';

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

revoke all on function public.assign_automotive_appointment_box(uuid, uuid) from public;
grant execute on function public.assign_automotive_appointment_box(uuid, uuid) to authenticated;
