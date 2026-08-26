-- Etapa 2 — ciclo de vida da OS (achados C-6, C-7 e C-13).
--
-- C-6  Abrir a OS vinculava `appointment_id` mas nunca mexia em `appointments.status`.
--      O agendamento ficava 'scheduled' para sempre, inclusive depois da OS entregue,
--      mantendo viva a reserva do profissional. Agenda e Pátio divergiam sem volta.
--
-- C-7  A limpeza da reserva de box do agendamento estava DENTRO de
--      `if p_box_id is not null`. Abrindo a OS sem box — o caso comum: o carro chega e
--      o box ainda está ocupado — a reserva ficava órfã e colidia depois.
--
-- C-13 Nada impedia duas OS ativas para o mesmo veículo: o mesmo carro aparecia duas
--      vezes no Pátio, com duas numerações e dois faturamentos.
--
-- ABORDAGEM
--
-- Gatilhos, em vez de redefinir `open_automotive_work_order`,
-- `deliver_automotive_work_order` e `transition_automotive_work_order` — três funções
-- longas. O gatilho cobre também qualquer caminho novo que venha a criar OS.

-- ---------------------------------------------------------------------------
-- Helper interno: leva o agendamento até o estado alvo respeitando a máquina
-- ---------------------------------------------------------------------------
-- A máquina de estados não aceita salto: 'scheduled' só vai a 'confirmed', que só vai
-- a 'in_progress'. Este helper caminha um passo legal por vez.
--
-- Não valida papel: é chamado de dentro de funções que já validaram, e nunca recebe
-- EXECUTE. Repete deliberadamente a escrita do evento e a liberação da reserva feitas
-- por `transition_staff_appointment`, em vez de chamá-la, para não reexecutar a
-- checagem de papel — um técnico pode cancelar a OS sem ser scheduler da agenda.

create or replace function public.sync_appointment_from_work_order(
  p_appointment_id uuid,
  p_target public.appointment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_previous public.appointment_status;
  v_step public.appointment_status;
  v_guard integer := 0;
begin
  if p_appointment_id is null then
    return;
  end if;

  select *
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id
  for update;

  if not found then
    return;
  end if;

  while v_appointment.status is distinct from p_target loop
    v_guard := v_guard + 1;
    exit when v_guard > 4;                       -- a máquina tem no máximo 3 passos
    exit when v_appointment.status in ('completed', 'cancelled');

    v_step := case
      when p_target = 'cancelled' then 'cancelled'
      when v_appointment.status = 'scheduled' then 'confirmed'
      when v_appointment.status = 'confirmed' then 'in_progress'
      when v_appointment.status = 'in_progress' then 'completed'
    end;

    exit when v_step is null;

    v_previous := v_appointment.status;

    update public.appointments appointment
    set status = v_step
    where appointment.id = v_appointment.id
    returning * into v_appointment;

    insert into public.appointment_events (
      tenant_id, appointment_id, event_type, previous_status, next_status,
      actor_user_id, metadata
    )
    values (
      v_appointment.tenant_id,
      v_appointment.id,
      case v_step
        when 'confirmed'   then 'confirmed'
        when 'in_progress' then 'started'
        when 'completed'   then 'completed'
        when 'cancelled'   then 'cancelled'
      end,
      v_previous,
      v_step,
      (select auth.uid()),
      jsonb_build_object('source', 'automotive_work_order')
    );

    if v_step in ('completed', 'cancelled') then
      delete from public.scheduling_resource_reservations reservation
      where reservation.appointment_id = v_appointment.id
        and reservation.kind = 'appointment';
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_appointment_from_work_order(uuid, public.appointment_status)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C-6 e C-7 — abrir a OS consome o agendamento de origem
-- ---------------------------------------------------------------------------

create or replace function public.consume_source_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_id is null then
    return null;
  end if;

  -- C-7: a reserva de box do agendamento sai SEMPRE, com ou sem box na OS. A partir
  -- daqui quem ocupa o box fisicamente é o bloqueio da própria OS. A reserva do
  -- profissional continua viva: ele segue alocado enquanto o serviço acontece.
  delete from public.scheduling_resource_reservations reservation
  using public.scheduling_resources resource
  where reservation.appointment_id = new.appointment_id
    and reservation.scheduling_resource_id = resource.id
    and reservation.tenant_id = resource.tenant_id
    and resource.kind = 'service_box';

  -- C-6: o agendamento passa a refletir que o atendimento começou.
  perform public.sync_appointment_from_work_order(new.appointment_id, 'in_progress');

  return null;
end;
$$;

revoke all on function public.consume_source_appointment() from public, anon, authenticated;

drop trigger if exists automotive_work_orders_consume_appointment on public.automotive_work_orders;

create trigger automotive_work_orders_consume_appointment
after insert on public.automotive_work_orders
for each row
execute function public.consume_source_appointment();

-- O `delete` equivalente que existe dentro de `open_automotive_work_order` vira
-- redundante — o gatilho já roda ao fim do INSERT, antes da atribuição do box. Foi
-- mantido lá para não reescrever uma função de 180 linhas por uma linha morta.

-- ---------------------------------------------------------------------------
-- C-6 — encerrar a OS encerra o agendamento
-- ---------------------------------------------------------------------------

create or replace function public.close_source_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_id is null or new.status = old.status then
    return null;
  end if;

  if new.status = 'delivered' then
    perform public.sync_appointment_from_work_order(new.appointment_id, 'completed');
  elsif new.status = 'cancelled' then
    perform public.sync_appointment_from_work_order(new.appointment_id, 'cancelled');
  end if;

  return null;
end;
$$;

revoke all on function public.close_source_appointment() from public, anon, authenticated;

drop trigger if exists automotive_work_orders_close_appointment on public.automotive_work_orders;

create trigger automotive_work_orders_close_appointment
after update of status on public.automotive_work_orders
for each row
execute function public.close_source_appointment();

-- ---------------------------------------------------------------------------
-- C-13 — uma OS ativa por veículo
-- ---------------------------------------------------------------------------
-- O gatilho dá a mensagem legível; o índice parcial fecha a corrida entre duas
-- aberturas simultâneas, que a checagem sozinha não pega.

create or replace function public.enforce_single_active_work_order_per_vehicle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('delivered', 'cancelled') then
    return new;
  end if;

  if exists (
    select 1
    from public.automotive_work_orders work_order
    where work_order.tenant_id = new.tenant_id
      and work_order.vehicle_id = new.vehicle_id
      and work_order.id <> new.id
      and work_order.status not in ('delivered', 'cancelled')
  ) then
    raise exception
      'Este veículo já possui uma ordem de serviço em aberto. Conclua ou cancele a anterior.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_single_active_work_order_per_vehicle()
  from public, anon, authenticated;

drop trigger if exists automotive_work_orders_single_active_vehicle on public.automotive_work_orders;

create trigger automotive_work_orders_single_active_vehicle
before insert or update of status, vehicle_id on public.automotive_work_orders
for each row
execute function public.enforce_single_active_work_order_per_vehicle();

-- ATENÇÃO AO APLICAR
--
-- O índice abaixo falha se a base já tiver duas OS ativas para o mesmo veículo — o
-- estado que este achado descreve. Antes de aplicar em um ambiente com dados, rode:
--
--   select tenant_id, vehicle_id, count(*), array_agg(number order by number)
--   from public.automotive_work_orders
--   where status not in ('delivered', 'cancelled')
--   group by tenant_id, vehicle_id
--   having count(*) > 1;
--
-- e encerre as duplicadas.

create unique index if not exists automotive_work_orders_one_active_per_vehicle_idx
  on public.automotive_work_orders (tenant_id, vehicle_id)
  where status not in ('delivered', 'cancelled');
