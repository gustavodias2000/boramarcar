-- Etapa 6 — fechar a ponte entre Agenda e Pátio.
--
-- Os ADRs 0001 e 0002 descrevem essa ponte como decisão central do módulo: o
-- agendamento e a OS são registros distintos, e o box é recurso de agenda
-- compartilhado. A auditoria encontrou seis funções prontas no banco e **nenhuma**
-- chamada pela interface. Na prática, Agenda e Pátio eram dois sistemas que não se
-- conversavam.
--
-- Falta uma que nunca existiu, e é a mais grave:
--
--   `assigned_professional_id` só é preenchido na abertura, copiado do agendamento.
--   Logo, TODA OS de entrada rápida nasce sem técnico. E como a política de mídia e a
--   transição por técnico dependem desse campo, o técnico de um walk-in não consegue
--   fotografar nem mover a própria OS.

alter table public.automotive_work_order_events
  drop constraint automotive_work_order_events_type;

alter table public.automotive_work_order_events
  add constraint automotive_work_order_events_type check (
    event_type in (
      'created',
      'item_added',
      'item_removed',
      'payment_recorded',
      'stage_changed',
      'box_assigned',
      'box_released',
      'professional_assigned',
      'media_added',
      'media_removed',
      'delivered',
      'cancelled'
    )
  );

-- ---------------------------------------------------------------------------
-- Atribuir ou trocar o técnico da OS
-- ---------------------------------------------------------------------------
-- Aceita nulo para desatribuir: o carro pode voltar para a fila sem dono.

create or replace function public.assign_automotive_work_order_professional(
  p_work_order_id uuid,
  p_professional_id uuid default null
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
    raise exception 'Only a scheduler can assign the work-order professional'
      using errcode = '42501';
  end if;

  if v_work_order.status in ('delivered', 'cancelled') then
    raise exception 'Uma ordem de serviço encerrada não muda de responsável.'
      using errcode = '22023';
  end if;

  if p_professional_id is not null and not exists (
    select 1
    from public.professionals professional
    where professional.id = p_professional_id
      and professional.tenant_id = v_work_order.tenant_id
      and professional.active
  ) then
    raise exception 'Profissional ativo não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  update public.automotive_work_orders work_order
  set assigned_professional_id = p_professional_id
  where work_order.id = v_work_order.id
  returning * into v_work_order;

  insert into public.automotive_work_order_events (
    tenant_id, work_order_id, event_type, actor_user_id, metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'professional_assigned',
    (select auth.uid()),
    jsonb_build_object('professional_id', p_professional_id)
  );

  return v_work_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editar e desativar box
-- ---------------------------------------------------------------------------
-- `create_automotive_box` existia; editar e desativar, não. Sem isso o box nasce e
-- não muda mais — nem quando a empresa renumera os boxes ou desativa um em reforma.

create or replace function public.update_automotive_box(
  p_box_id uuid,
  p_code text default null,
  p_name text default null,
  p_display_order integer default null,
  p_active boolean default null
)
returns public.automotive_boxes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_box public.automotive_boxes;
begin
  select *
  into v_box
  from public.automotive_boxes box
  where box.id = p_box_id
  for update;

  if not found then
    raise exception 'Automotive box not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_box.tenant_id) then
    raise exception 'Only a scheduler can update an Automotive box' using errcode = '42501';
  end if;

  -- Desativar um box com carro dentro esconderia uma ocupação real.
  if p_active is false and exists (
    select 1
    from public.automotive_work_orders work_order
    where work_order.assigned_box_id = v_box.id
      and work_order.status not in ('delivered', 'cancelled')
  ) then
    raise exception 'Este box está ocupado por uma ordem de serviço ativa.'
      using errcode = '22023';
  end if;

  update public.automotive_boxes box
  set code = coalesce(nullif(trim(coalesce(p_code, '')), ''), box.code),
      name = coalesce(nullif(trim(coalesce(p_name, '')), ''), box.name),
      display_order = coalesce(p_display_order, box.display_order),
      active = coalesce(p_active, box.active)
  where box.id = v_box.id
  returning * into v_box;

  -- O recurso de agenda acompanha: um box desativado não pode continuar reservável.
  update public.scheduling_resources resource
  set name = v_box.name,
      active = v_box.active
  where resource.id = v_box.scheduling_resource_id
    and resource.tenant_id = v_box.tenant_id;

  return v_box;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disponibilidade recorrente por RPC
-- ---------------------------------------------------------------------------
-- A interface gravava direto em `professional_schedule_rules` — a única escrita
-- direta que sobrou no produto. Com RPC, o grant da tabela cai para SELECT e a
-- validação de papel deixa de depender só da política.

create or replace function public.set_professional_schedule_rule(
  p_professional_id uuid,
  p_weekday smallint,
  p_starts_at time,
  p_ends_at time
)
returns public.professional_schedule_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional public.professionals;
  v_rule public.professional_schedule_rules;
begin
  select *
  into v_professional
  from public.professionals professional
  where professional.id = p_professional_id
    and professional.active;

  if not found then
    raise exception 'Profissional ativo não encontrado.' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_professional.tenant_id)
    and not public.is_current_user_professional(v_professional.id, v_professional.tenant_id) then
    raise exception 'Você não pode alterar a disponibilidade deste profissional.'
      using errcode = '42501';
  end if;

  if p_weekday is null or p_weekday < 0 or p_weekday > 6 then
    raise exception 'Dia da semana inválido.' using errcode = '22023';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'O intervalo de disponibilidade precisa ter duração positiva.'
      using errcode = '22023';
  end if;

  insert into public.professional_schedule_rules (
    tenant_id, professional_id, weekday, starts_at, ends_at, created_by
  )
  values (
    v_professional.tenant_id,
    v_professional.id,
    p_weekday,
    p_starts_at,
    p_ends_at,
    (select auth.uid())
  )
  returning * into v_rule;

  return v_rule;
end;
$$;

create or replace function public.remove_professional_schedule_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.professional_schedule_rules;
begin
  select *
  into v_rule
  from public.professional_schedule_rules rule
  where rule.id = p_rule_id;

  if not found then
    return;
  end if;

  if not public.is_tenant_scheduler(v_rule.tenant_id)
    and not public.is_current_user_professional(v_rule.professional_id, v_rule.tenant_id) then
    raise exception 'Você não pode alterar a disponibilidade deste profissional.'
      using errcode = '42501';
  end if;

  delete from public.professional_schedule_rules rule where rule.id = v_rule.id;
end;
$$;

-- A escrita direta deixa de ser necessária: o grant cai para leitura.
revoke insert, update, delete on public.professional_schedule_rules from authenticated;

revoke all on function public.assign_automotive_work_order_professional(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_automotive_work_order_professional(uuid, uuid)
  to authenticated;

revoke all on function public.update_automotive_box(uuid, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.update_automotive_box(uuid, text, text, integer, boolean)
  to authenticated;

revoke all on function public.set_professional_schedule_rule(uuid, smallint, time, time)
  from public, anon, authenticated;
grant execute on function public.set_professional_schedule_rule(uuid, smallint, time, time)
  to authenticated;

revoke all on function public.remove_professional_schedule_rule(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_professional_schedule_rule(uuid) to authenticated;

comment on function public.assign_automotive_work_order_professional(uuid, uuid) is
  'Atribui ou troca o técnico responsável pela OS. Sem ela, toda OS de entrada rápida '
  'ficava sem responsável, e o técnico não conseguia fotografar nem avançar a própria OS.';
