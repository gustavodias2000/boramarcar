-- Preserve the source status in the immutable appointment event timeline.

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
  v_previous_status public.appointment_status;
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

  v_previous_status := v_appointment.status;
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
    v_previous_status,
    p_next_status,
    (select auth.uid())
  );

  return v_appointment;
end;
$$;
