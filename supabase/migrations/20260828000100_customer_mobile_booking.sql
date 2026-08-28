-- Mobile v1: the customer can see only a linked business and reserve only for
-- themself.  Tables stay closed; the small API below is the complete surface.

create or replace function public.list_customer_businesses()
returns table (
  tenant_id uuid,
  business_name text,
  business_slug text,
  business_type public.business_type,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    business.id,
    business.name,
    business.slug,
    business.business_type,
    business.timezone
  from public.customer_links link
  join public.businesses business on business.id = link.tenant_id
  where link.user_id = (select auth.uid())
    and link.active
    and business.active
  order by business.name;
$$;

create or replace function public.get_customer_booking_catalog(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_business public.businesses;
begin
  v_customer_id := public.current_customer_id(p_tenant_id);
  if v_customer_id is null then
    raise exception 'Cliente sem vínculo ativo nesta empresa.' using errcode = '42501';
  end if;

  select * into v_business
  from public.businesses business
  where business.id = p_tenant_id and business.active;

  if not found then
    raise exception 'Empresa ativa não encontrada.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'business_type', v_business.business_type,
      'timezone', v_business.timezone
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'duration_minutes', service.duration_minutes,
        'base_price', service.base_price
      ) order by service.name)
      from public.services service
      where service.tenant_id = p_tenant_id and service.active
    ), '[]'::jsonb),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object('id', professional.id, 'name', professional.name) order by professional.name)
      from public.professionals professional
      where professional.tenant_id = p_tenant_id and professional.active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_customer_available_slots(
  p_tenant_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date
)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_duration_minutes integer;
  v_timezone text;
  v_resource_id uuid;
  v_candidate_start timestamptz;
  v_candidate_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  v_customer_id := public.current_customer_id(p_tenant_id);
  if v_customer_id is null then
    raise exception 'Cliente sem vínculo ativo nesta empresa.' using errcode = '42501';
  end if;

  select business.timezone into v_timezone
  from public.businesses business
  where business.id = p_tenant_id and business.active;
  if not found then
    raise exception 'Empresa ativa não encontrada.' using errcode = 'P0001';
  end if;

  if p_date < (now() at time zone v_timezone)::date then
    raise exception 'Não é possível consultar horários passados.' using errcode = '22023';
  end if;

  select service.duration_minutes into v_duration_minutes
  from public.services service
  where service.id = p_service_id and service.tenant_id = p_tenant_id and service.active;
  if not found then
    raise exception 'Serviço ativo não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  select resource.id into v_resource_id
  from public.scheduling_resources resource
  join public.professionals professional
    on professional.id = resource.professional_id and professional.tenant_id = resource.tenant_id
  where resource.tenant_id = p_tenant_id
    and resource.professional_id = p_professional_id
    and resource.kind = 'professional'
    and resource.active
    and professional.active;
  if not found then
    raise exception 'Profissional ativo não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  v_day_start := p_date::timestamp at time zone v_timezone;
  v_day_end := (p_date + 1)::timestamp at time zone v_timezone;

  for v_candidate_start in
    select slot_start.value
    from generate_series(
      v_day_start,
      v_day_end - make_interval(mins => v_duration_minutes),
      interval '30 minutes'
    ) as slot_start(value)
  loop
    v_candidate_end := v_candidate_start + make_interval(mins => v_duration_minutes);
    if v_candidate_start <= now() then
      continue;
    end if;

    begin
      perform public.require_available_professional_resource(
        p_tenant_id,
        p_professional_id,
        v_candidate_start,
        v_candidate_end
      );
    exception when others then
      continue;
    end;

    if not exists (
      select 1
      from public.scheduling_resource_reservations reservation
      where reservation.scheduling_resource_id = v_resource_id
        and tstzrange(reservation.start_at, reservation.end_at, '[)')
            && tstzrange(v_candidate_start, v_candidate_end, '[)')
    ) then
      start_at := v_candidate_start;
      end_at := v_candidate_end;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.create_customer_appointment(
  p_tenant_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_duration_minutes integer;
  v_end_at timestamptz;
  v_resource_id uuid;
  v_appointment_id uuid;
begin
  v_customer_id := public.current_customer_id(p_tenant_id);
  if v_customer_id is null then
    raise exception 'Cliente sem vínculo ativo nesta empresa.' using errcode = '42501';
  end if;
  if p_start_at is null or p_start_at <= now() then
    raise exception 'Escolha um horário futuro.' using errcode = '22023';
  end if;

  select service.duration_minutes into v_duration_minutes
  from public.services service
  where service.id = p_service_id and service.tenant_id = p_tenant_id and service.active;
  if not found then
    raise exception 'Serviço ativo não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_duration_minutes);
  v_resource_id := public.require_available_professional_resource(
    p_tenant_id,
    p_professional_id,
    p_start_at,
    v_end_at
  );

  insert into public.appointments (
    tenant_id, customer_id, service_id, professional_id, start_at, end_at, status, notes, created_by
  )
  values (
    p_tenant_id, v_customer_id, p_service_id, p_professional_id, p_start_at, v_end_at, 'scheduled', null, (select auth.uid())
  )
  returning id into v_appointment_id;

  insert into public.scheduling_resource_reservations (
    tenant_id, scheduling_resource_id, appointment_id, kind, start_at, end_at, created_by
  )
  values (
    p_tenant_id, v_resource_id, v_appointment_id, 'appointment', p_start_at, v_end_at, (select auth.uid())
  );

  insert into public.appointment_events (
    tenant_id, appointment_id, event_type, next_status, actor_user_id, metadata
  )
  values (
    p_tenant_id,
    v_appointment_id,
    'created',
    'scheduled',
    (select auth.uid()),
    jsonb_build_object('service_id', p_service_id, 'professional_id', p_professional_id, 'origin', 'customer_mobile')
  );

  return v_appointment_id;
end;
$$;

create or replace function public.list_my_customer_appointments(p_tenant_id uuid)
returns table (
  id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status public.appointment_status,
  service_name text,
  professional_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := public.current_customer_id(p_tenant_id);
  if v_customer_id is null then
    raise exception 'Cliente sem vínculo ativo nesta empresa.' using errcode = '42501';
  end if;

  return query
  select
    appointment.id,
    appointment.start_at,
    appointment.end_at,
    appointment.status,
    service.name,
    professional.name
  from public.appointments appointment
  join public.services service on service.id = appointment.service_id
  join public.professionals professional on professional.id = appointment.professional_id
  where appointment.tenant_id = p_tenant_id
    and appointment.customer_id = v_customer_id
  order by appointment.start_at;
end;
$$;

revoke all on function public.list_customer_businesses() from public, anon, authenticated;
revoke all on function public.get_customer_booking_catalog(uuid) from public, anon, authenticated;
revoke all on function public.list_customer_available_slots(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.create_customer_appointment(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.list_my_customer_appointments(uuid) from public, anon, authenticated;

grant execute on function public.list_customer_businesses() to authenticated;
grant execute on function public.get_customer_booking_catalog(uuid) to authenticated;
grant execute on function public.list_customer_available_slots(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.create_customer_appointment(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.list_my_customer_appointments(uuid) to authenticated;

comment on function public.create_customer_appointment(uuid, uuid, uuid, timestamptz) is
  'Reserva mobile do cliente: deriva o cadastro do vínculo ativo e grava agenda, recurso e evento numa única transação.';
