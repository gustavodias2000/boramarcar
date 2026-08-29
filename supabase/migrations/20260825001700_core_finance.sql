-- Financeiro do núcleo (§43 do Contexto Mestre).
--
-- A LACUNA
--
-- O núcleo não registrava dinheiro. Pagamento existia só em
-- `automotive_work_order_payments` — uma barbearia não tinha onde lançar o que
-- recebeu, e a tela de relatórios teve que admitir isso em voz alta.
--
-- A DECISÃO: UM LIVRO SÓ
--
-- `finance_entries` é o único lugar onde dinheiro é registrado, venha de onde vier:
-- de um agendamento, de uma ordem de serviço ou de um lançamento avulso. Dois livros
-- divergem — sempre. Por isso o pagamento da OS automotiva passa a ESPELHAR aqui por
-- gatilho, em vez de viver em paralelo.
--
-- QUEM VÊ
--
-- Diferente de `automotive_work_order_payments`, que qualquer membro lê (é o achado
-- C-8 em outra forma), o livro financeiro é visível só a operador financeiro. Um
-- técnico não precisa saber quanto a empresa faturou.

create type public.payment_method as enum (
  'cash',
  'pix',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'other'
);

-- NOTA: `automotive_payment_method` tem os mesmos valores e continua existindo porque
-- é usado por uma tabela publicada. A convergência é uma migration futura; até lá o
-- gatilho de espelhamento converte por texto.

create type public.finance_entry_kind as enum ('income', 'expense', 'refund');

-- ---------------------------------------------------------------------------
-- Caixa
-- ---------------------------------------------------------------------------
-- Sessão de caixa: abre com um valor declarado, fecha com o contado. A diferença
-- entre o esperado e o contado é o que a conferência procura — e ela só existe se os
-- dois números forem guardados separadamente.

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,

  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users (id) on delete set null,
  opening_amount numeric(12, 2) not null default 0,

  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  /** O que o sistema calculou. */
  expected_amount numeric(12, 2),
  /** O que a pessoa contou na gaveta. */
  counted_amount numeric(12, 2),
  notes text,

  unique (id, tenant_id),
  constraint cash_sessions_amounts_nonnegative check (
    opening_amount >= 0
    and (expected_amount is null or expected_amount >= 0)
    and (counted_amount is null or counted_amount >= 0)
  ),
  constraint cash_sessions_close_is_complete check (
    (closed_at is null and counted_amount is null)
    or (closed_at is not null and counted_amount is not null)
  )
);

-- Um caixa aberto por vez, por empresa. Dois caixas simultâneos tornam a conferência
-- impossível: não há como saber em qual gaveta o dinheiro entrou.
create unique index cash_sessions_one_open_per_tenant_idx
  on public.cash_sessions (tenant_id)
  where closed_at is null;

-- ---------------------------------------------------------------------------
-- Livro financeiro
-- ---------------------------------------------------------------------------

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,

  kind public.finance_entry_kind not null,
  method public.payment_method not null default 'cash',
  amount numeric(12, 2) not null,
  occurred_on date not null default current_date,
  description text,

  /** Origem. Nenhuma, uma ou outra — nunca as duas. */
  appointment_id uuid,
  work_order_id uuid,
  customer_id uuid,
  professional_id uuid,
  cash_session_id uuid,

  /** Preenchido quando a entrada é a comissão calculada de um atendimento. */
  is_commission boolean not null default false,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (id, tenant_id),
  constraint finance_entries_amount_positive check (amount > 0),
  constraint finance_entries_single_origin check (
    num_nonnulls(appointment_id, work_order_id) <= 1
  ),
  constraint finance_entries_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete set null,
  constraint finance_entries_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete set null,
  constraint finance_entries_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete set null,
  constraint finance_entries_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete set null,
  constraint finance_entries_cash_session_belongs_to_tenant
    foreign key (cash_session_id, tenant_id)
    references public.cash_sessions (id, tenant_id)
    on delete set null
);

create index finance_entries_period_idx
  on public.finance_entries (tenant_id, occurred_on desc, kind);

create index finance_entries_professional_idx
  on public.finance_entries (tenant_id, professional_id, occurred_on desc)
  where professional_id is not null;

-- ---------------------------------------------------------------------------
-- Comissão
-- ---------------------------------------------------------------------------
-- Vem do Barbershop, onde é configurada por membro da equipe em percentual ou valor
-- fixo. Aqui fica no profissional, que é a entidade do núcleo.

create type public.commission_kind as enum ('percent', 'fixed');

alter table public.professionals
  add column commission_kind public.commission_kind,
  add column commission_percent numeric(5, 2),
  add column commission_amount numeric(12, 2);

alter table public.professionals
  add constraint professionals_commission_is_complete check (
    commission_kind is null
    or (commission_kind = 'percent' and commission_percent between 0 and 100)
    or (commission_kind = 'fixed' and commission_amount >= 0)
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Leitura restrita a operador financeiro. É a correção que `automotive_work_order_payments`
-- ainda não recebeu, e que o C-8 pede: isolamento entre empresas está firme, mas dentro
-- da empresa nem todo papel precisa ver dinheiro.

alter table public.cash_sessions enable row level security;
alter table public.finance_entries enable row level security;

create policy cash_sessions_select_finance
on public.cash_sessions for select to authenticated
using (public.is_tenant_finance_operator(tenant_id));

create policy finance_entries_select_finance
on public.finance_entries for select to authenticated
using (public.is_tenant_finance_operator(tenant_id));

revoke all on public.cash_sessions from anon, authenticated;
revoke all on public.finance_entries from anon, authenticated;
grant select on public.cash_sessions to authenticated;
grant select on public.finance_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Abrir e fechar o caixa
-- ---------------------------------------------------------------------------

create or replace function public.open_cash_session(
  p_tenant_id uuid,
  p_opening_amount numeric default 0
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if not public.is_tenant_finance_operator(p_tenant_id) then
    raise exception 'Only a finance operator can open the cash register' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cash_sessions session
    where session.tenant_id = p_tenant_id and session.closed_at is null
  ) then
    raise exception 'Já existe um caixa aberto nesta unidade.' using errcode = '22023';
  end if;

  insert into public.cash_sessions (tenant_id, opened_by, opening_amount)
  values (p_tenant_id, (select auth.uid()), greatest(coalesce(p_opening_amount, 0), 0))
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_esperado numeric(12, 2);
begin
  select *
  into v_session
  from public.cash_sessions session
  where session.id = p_session_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_finance_operator(v_session.tenant_id) then
    raise exception 'Only a finance operator can close the cash register' using errcode = '42501';
  end if;

  if v_session.closed_at is not null then
    raise exception 'Este caixa já foi fechado.' using errcode = '22023';
  end if;

  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'Informe o valor contado na gaveta.' using errcode = '22023';
  end if;

  -- Só dinheiro em espécie passa pela gaveta: pix e cartão não mudam o que se conta.
  select v_session.opening_amount + coalesce(sum(
    case entry.kind
      when 'income' then entry.amount
      when 'refund' then -entry.amount
      when 'expense' then -entry.amount
    end
  ), 0)
  into v_esperado
  from public.finance_entries entry
  where entry.cash_session_id = v_session.id
    and entry.method = 'cash';

  update public.cash_sessions session
  set closed_at = now(),
      closed_by = (select auth.uid()),
      expected_amount = v_esperado,
      counted_amount = p_counted_amount,
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where session.id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lançar no livro
-- ---------------------------------------------------------------------------

create or replace function public.record_finance_entry(
  p_tenant_id uuid,
  p_kind public.finance_entry_kind,
  p_amount numeric,
  p_method public.payment_method default 'cash',
  p_description text default null,
  p_appointment_id uuid default null,
  p_customer_id uuid default null,
  p_professional_id uuid default null,
  p_occurred_on date default null
)
returns public.finance_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.finance_entries;
  v_session_id uuid;
begin
  if not public.is_tenant_finance_operator(p_tenant_id) then
    raise exception 'Only a finance operator can record finance entries' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor precisa ser maior que zero.' using errcode = '22023';
  end if;

  -- Amarra ao caixa aberto, se houver. Sem caixa aberto o lançamento continua válido:
  -- pix e cartão não passam pela gaveta.
  select session.id
  into v_session_id
  from public.cash_sessions session
  where session.tenant_id = p_tenant_id and session.closed_at is null;

  insert into public.finance_entries (
    tenant_id, kind, method, amount, occurred_on, description,
    appointment_id, customer_id, professional_id, cash_session_id, created_by
  )
  values (
    p_tenant_id,
    p_kind,
    p_method,
    p_amount,
    coalesce(p_occurred_on, current_date),
    nullif(trim(coalesce(p_description, '')), ''),
    p_appointment_id,
    p_customer_id,
    p_professional_id,
    v_session_id,
    (select auth.uid())
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- O pagamento da OS espelha no livro
-- ---------------------------------------------------------------------------
-- Sem isto haveria duas verdades sobre o mesmo dinheiro. O livro é a fonte; a tabela
-- da OS continua existindo porque a OS precisa saber o próprio saldo.

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
    (new.paid_at at time zone 'UTC')::date,
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

drop trigger if exists automotive_work_order_payments_mirror_finance
  on public.automotive_work_order_payments;

create trigger automotive_work_order_payments_mirror_finance
after insert on public.automotive_work_order_payments
for each row
execute function public.mirror_work_order_payment_to_finance();

-- ---------------------------------------------------------------------------
-- Comissão ao concluir o atendimento
-- ---------------------------------------------------------------------------
-- Lançada como despesa: é dinheiro que a empresa deve ao profissional. Só acontece
-- quando o profissional tem comissão configurada.

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

  select * into v_professional
  from public.professionals professional
  where professional.id = new.professional_id;

  if not found or v_professional.commission_kind is null then
    return null;
  end if;

  select * into v_service
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
    (new.start_at at time zone 'UTC')::date,
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

drop trigger if exists appointments_record_commission on public.appointments;

create trigger appointments_record_commission
after update of status on public.appointments
for each row
execute function public.record_appointment_commission();

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke all on function public.mirror_work_order_payment_to_finance() from public, anon, authenticated;
revoke all on function public.record_appointment_commission() from public, anon, authenticated;

revoke all on function public.open_cash_session(uuid, numeric) from public, anon, authenticated;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated;

revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;

revoke all on function public.record_finance_entry(
  uuid, public.finance_entry_kind, numeric, public.payment_method, text, uuid, uuid, uuid, date
) from public, anon, authenticated;
grant execute on function public.record_finance_entry(
  uuid, public.finance_entry_kind, numeric, public.payment_method, text, uuid, uuid, uuid, date
) to authenticated;

comment on table public.finance_entries is
  'Livro financeiro do núcleo. Único lugar onde dinheiro é registrado, venha de '
  'agendamento, ordem de serviço ou lançamento avulso. Visível só a operador financeiro.';
