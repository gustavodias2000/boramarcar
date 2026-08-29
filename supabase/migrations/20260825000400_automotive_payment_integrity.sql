-- Etapa 2 — integridade financeira da OS (achados C-9 e C-14).
--
-- C-9  `record_automotive_work_order_payment` validava apenas `amount > 0`. Aceitava
--      recebimento de R$ 1.000.000 numa OS de R$ 120 e estorno maior que tudo que
--      entrou, produzindo saldo recebido negativo.
--
-- C-14 `payment_status` colapsava "ainda não há o que cobrar" em 'paid'. Toda OS de
--      entrada rápida nasce sem item, então entrava no Pátio marcada como quitada —
--      exatamente quando a recepção mais precisa ver que ainda falta cobrar.

-- ---------------------------------------------------------------------------
-- C-9 — o recebimento passa a conversar com o valor da OS
-- ---------------------------------------------------------------------------
-- O `for update` que já existia na OS serializa recebimentos concorrentes da mesma
-- ordem, então a soma lida aqui não corre risco de leitura suja.

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
  v_total numeric(12, 2);
  v_settled numeric(12, 2);
  v_next numeric(12, 2);
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

  select coalesce(sum(item.line_total), 0)
  into v_total
  from public.automotive_work_order_items item
  where item.work_order_id = v_work_order.id;

  select coalesce(
    sum(case payment.kind when 'payment' then payment.amount else -payment.amount end),
    0
  )
  into v_settled
  from public.automotive_work_order_payments payment
  where payment.work_order_id = v_work_order.id;

  v_next := v_settled + case p_kind when 'payment' then p_amount else -p_amount end;

  if p_kind = 'payment' and v_next > v_total then
    raise exception
      'O recebimento excede o valor da ordem de serviço. Total %, já recebido %, tentativa de %.',
      v_total, v_settled, p_amount
      using errcode = '22023';
  end if;

  if p_kind = 'refund' and v_next < 0 then
    raise exception
      'O estorno excede o valor já recebido. Recebido %, tentativa de estorno de %.',
      v_settled, p_amount
      using errcode = '22023';
  end if;

  insert into public.automotive_work_order_payments (
    tenant_id, work_order_id, kind, method, amount, paid_at, notes, recorded_by
  )
  values (
    v_work_order.tenant_id, v_work_order.id, p_kind, p_method,
    p_amount, p_paid_at, p_notes, (select auth.uid())
  )
  returning * into v_payment;

  insert into public.automotive_work_order_events (
    tenant_id, work_order_id, event_type, actor_user_id, metadata
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
      'method', p_method,
      'settled_after', v_next,
      'total', v_total
    )
  );

  return v_payment;
end;
$$;

-- `create or replace` preserva a ACL da função, mas reconceder aqui torna a migration
-- autossuficiente e mantém a lista do snapshot de privilégios verdadeira.
grant execute on function public.record_automotive_work_order_payment(
  uuid, public.automotive_payment_kind, public.automotive_payment_method, numeric, timestamptz, text
) to authenticated;

-- Se no futuro a empresa precisar aceitar valor a maior — gorjeta, sinal, acerto —
-- isso deve virar um `kind` próprio no enum, e não um recebimento que estoura o total.

-- ---------------------------------------------------------------------------
-- C-14 — OS sem item lançado ganha estado próprio
-- ---------------------------------------------------------------------------
-- `item_totals.total_amount is null` significa que a OS não tem NENHUM item, que é
-- diferente de ter itens somando zero — um serviço de cortesia continua sendo 'paid'.

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
    when item_totals.total_amount is null then 'unbilled'
    when coalesce(payment_totals.paid_amount, 0) >= item_totals.total_amount then 'paid'
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

comment on view public.automotive_patio is
  'Visão operacional das OS ativas. payment_status: unbilled (nenhum item lançado), '
  'unpaid, partial, paid.';
