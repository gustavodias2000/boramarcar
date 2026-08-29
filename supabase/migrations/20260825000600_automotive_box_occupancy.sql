-- Etapa 2 — ocupação de box com fim previsto (achado C-5).
--
-- O PROBLEMA
--
-- A ocupação física era reservada como `[received_at, 'infinity')`. A exclusion
-- constraint então recusava TODA reserva futura daquele box enquanto houvesse um
-- carro dentro. É simétrico e igualmente ruim nos dois sentidos:
--
--   a) com um carro no box B, agendar B para amanhã falha;
--   b) havendo agendamento futuro com B reservado, receber um carro hoje em B falha
--      com `exclusion_violation` cru do Postgres, sem tratamento.
--
-- O caso (b) é a operação normal de qualquer empresa que agende com antecedência.
--
-- A CORREÇÃO
--
-- Ocupação física não tem fim conhecido, mas precisa ter fim PREVISTO para conviver
-- com agendamento. A reserva passa a ser `[received_at, received_at + previsão)`,
-- onde a previsão é a soma da duração dos serviços lançados, com um piso.
--
-- TRADE-OFF ACEITO
--
-- Se o serviço passar da previsão, o box aparece livre com o carro ainda dentro. É
-- melhor que o estado anterior, em que o box ficava bloqueado para sempre. Lançar um
-- item estende a reserva, o que cobre o caso comum de o serviço crescer durante o
-- atendimento.

-- ---------------------------------------------------------------------------
-- Previsão de término
-- ---------------------------------------------------------------------------
-- Itens de texto livre não têm duração; só contam os que vieram de um serviço do
-- catálogo. O piso de 120 minutos evita reserva de duração zero numa OS de entrada
-- rápida, que nasce sem item.
--
-- TODO(Etapa 4): tornar o piso configurável por empresa, junto da configuração de
-- agenda completa (§61 do Contexto Mestre).

create or replace function public.automotive_work_order_box_end_at(
  p_work_order_id uuid,
  p_start_at timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select p_start_at + make_interval(mins => greatest(
    coalesce((
      select ceil(sum(service.duration_minutes * item.quantity))::integer
      from public.automotive_work_order_items item
      join public.services service
        on service.id = item.source_service_id
        and service.tenant_id = item.tenant_id
      where item.work_order_id = p_work_order_id
    ), 0),
    120
  ));
$$;

revoke all on function public.automotive_work_order_box_end_at(uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atribuição do box, com intervalo limitado e conflito legível
-- ---------------------------------------------------------------------------

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
  v_end_at timestamptz;
  v_conflict_start timestamptz;
  v_conflict_end timestamptz;
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

  -- Libera a reserva anterior antes de calcular o conflito, senão a própria OS
  -- apareceria como concorrente ao trocar de box.
  if v_work_order.box_reservation_id is not null then
    update public.automotive_work_orders work_order
    set assigned_box_id = null,
        box_reservation_id = null
    where work_order.id = v_work_order.id;

    delete from public.scheduling_resource_reservations
    where id = v_work_order.box_reservation_id
      and tenant_id = v_work_order.tenant_id;
  end if;

  v_end_at := public.automotive_work_order_box_end_at(v_work_order.id, v_received_at);

  -- Conflito explicado antes de deixar a constraint falar em código do Postgres.
  select reservation.start_at, reservation.end_at
  into v_conflict_start, v_conflict_end
  from public.scheduling_resource_reservations reservation
  where reservation.scheduling_resource_id = v_box_resource_id
    and tstzrange(reservation.start_at, reservation.end_at, '[)')
        && tstzrange(v_received_at, v_end_at, '[)')
  order by reservation.start_at
  limit 1;

  if found then
    raise exception
      'Este box já está reservado de % até %. Escolha outro box ou ajuste o horário de entrada.',
      v_conflict_start, v_conflict_end
      using errcode = '22023';
  end if;

  insert into public.scheduling_resource_reservations (
    tenant_id, scheduling_resource_id, kind, start_at, end_at, reason, created_by
  )
  values (
    v_work_order.tenant_id,
    v_box_resource_id,
    'block',
    v_received_at,
    v_end_at,
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
    tenant_id, work_order_id, event_type, actor_user_id, metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'box_assigned',
    (select auth.uid()),
    jsonb_build_object('box_id', p_box_id, 'reserved_until', v_end_at)
  );

  return v_work_order;
end;
$$;

grant execute on function public.assign_automotive_work_order_box(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Lançar item estende a ocupação
-- ---------------------------------------------------------------------------
-- A extensão é limitada pelo início da próxima reserva do mesmo box, então nunca
-- colide: o box é nosso até o próximo compromisso. Lançar um item jamais falha por
-- causa de capacidade — item é fato de cobrança, reserva é fato de capacidade, e um
-- não deve bloquear o outro.

create or replace function public.extend_automotive_work_order_box_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_reservation public.scheduling_resource_reservations;
  v_desired_end timestamptz;
  v_next_start timestamptz;
  v_new_end timestamptz;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = new.work_order_id;

  if not found or v_work_order.box_reservation_id is null then
    return null;
  end if;

  select *
  into v_reservation
  from public.scheduling_resource_reservations reservation
  where reservation.id = v_work_order.box_reservation_id
  for update;

  if not found then
    return null;
  end if;

  v_desired_end := public.automotive_work_order_box_end_at(
    v_work_order.id,
    v_reservation.start_at
  );

  if v_desired_end <= v_reservation.end_at then
    return null;
  end if;

  select min(reservation.start_at)
  into v_next_start
  from public.scheduling_resource_reservations reservation
  where reservation.scheduling_resource_id = v_reservation.scheduling_resource_id
    and reservation.id <> v_reservation.id
    and reservation.start_at >= v_reservation.end_at;

  v_new_end := least(v_desired_end, coalesce(v_next_start, v_desired_end));

  if v_new_end > v_reservation.end_at then
    update public.scheduling_resource_reservations reservation
    set end_at = v_new_end
    where reservation.id = v_reservation.id;
  end if;

  return null;
end;
$$;

revoke all on function public.extend_automotive_work_order_box_reservation()
  from public, anon, authenticated;

drop trigger if exists automotive_work_order_items_extend_box
  on public.automotive_work_order_items;

create trigger automotive_work_order_items_extend_box
after insert on public.automotive_work_order_items
for each row
execute function public.extend_automotive_work_order_box_reservation();
