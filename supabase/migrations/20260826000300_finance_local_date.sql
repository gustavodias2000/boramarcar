-- O livro financeiro lançava no dia errado.
--
-- Os dois gatilhos que escrevem em `finance_entries` derivavam a data assim:
--
--   (new.paid_at  at time zone 'UTC')::date   -- mirror_work_order_payment_to_finance
--   (new.start_at at time zone 'UTC')::date   -- record_appointment_commission
--
-- `timestamptz at time zone 'UTC'` devolve o horário em UTC, não no fuso da empresa.
-- Um atendimento das 21h em São Paulo (UTC−3) vira meia-noite do dia seguinte em UTC,
-- e cai no relatório do dia errado. Barbearia que fecha às 20h e salão que atende à
-- noite têm o movimento inteiro da última hora deslocado.
--
-- `businesses.timezone` existe desde a fundação e é exatamente para isto.

create or replace function public.business_local_date(
  p_tenant_id uuid,
  p_moment timestamptz
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_moment at time zone coalesce(
    (select business.timezone from public.businesses business where business.id = p_tenant_id),
    'America/Sao_Paulo'
  ))::date;
$$;

comment on function public.business_local_date(uuid, timestamptz) is
  'A data como a empresa a vive, não como o servidor a guarda. O fallback existe para '
  'o caso de a empresa sumir no meio de um cascade — nunca em operação normal.';

-- ---------------------------------------------------------------------------

create or replace function public.mirror_work_order_payment_to_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_session_id uuid;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = new.work_order_id;

  select session.id
  into v_session_id
  from public.cash_sessions session
  where session.tenant_id = new.tenant_id and session.closed_at is null;

  insert into public.finance_entries (
    tenant_id, kind, method, amount, occurred_on, description,
    work_order_id, customer_id, professional_id, cash_session_id, created_by
  )
  values (
    new.tenant_id,
    case new.kind when 'payment' then 'income'::public.finance_entry_kind
                  else 'refund'::public.finance_entry_kind end,
    new.method::text::public.payment_method,
    new.amount,
    public.business_local_date(new.tenant_id, new.paid_at),
    format('OS #%s', v_work_order.number),
    new.work_order_id,
    v_work_order.customer_id,
    v_work_order.assigned_professional_id,
    v_session_id,
    new.recorded_by
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------

create or replace function public.record_appointment_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional public.professionals;
  v_service public.services;
  v_valor numeric(12, 2);
begin
  if new.status <> 'completed' or old.status = 'completed' or new.professional_id is null then
    return null;
  end if;

  select *
  into v_professional
  from public.professionals professional
  where professional.id = new.professional_id;

  if not found or v_professional.commission_kind is null then
    return null;
  end if;

  select *
  into v_service
  from public.services service
  where service.id = new.service_id;

  v_valor := case v_professional.commission_kind
    when 'percent' then round(coalesce(v_service.base_price, 0) * v_professional.commission_percent / 100, 2)
    when 'fixed' then v_professional.commission_amount
  end;

  if coalesce(v_valor, 0) <= 0 then
    return null;
  end if;

  insert into public.finance_entries (
    tenant_id, kind, method, amount, occurred_on, description,
    appointment_id, customer_id, professional_id, is_commission, created_by
  )
  values (
    new.tenant_id,
    'expense',
    'cash',
    v_valor,
    public.business_local_date(new.tenant_id, new.start_at),
    format('Comissão — %s', v_professional.name),
    new.id,
    new.customer_id,
    new.professional_id,
    true,
    (select auth.uid())
  );

  return null;
end;
$$;

-- Chamada só de dentro dos dois gatilhos acima, que são SECURITY DEFINER e rodam como
-- o dono. Ninguém precisa de EXECUTE — e conceder seria abrir leitura do fuso de
-- qualquer empresa a qualquer autenticado.
revoke all on function public.business_local_date(uuid, timestamptz)
  from public, anon, authenticated;
