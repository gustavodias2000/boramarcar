-- Financeiro do núcleo — livro único, caixa e comissão.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('caixa', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.cashier', t ->> 'cashier_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Caixa: um aberto por vez
-- ---------------------------------------------------------------------------

select tests.act_as(current_setting('tests.cashier')::uuid);

do $$
declare
  v_session public.cash_sessions;
begin
  select * into v_session
  from public.open_cash_session(current_setting('tests.tenant')::uuid, 100);
  perform set_config('tests.session', v_session.id::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.cash_sessions
     where id = current_setting('tests.session')::uuid and closed_at is null $$,
  'control — o caixa abre com o valor declarado'
);

-- Dois caixas simultaneos tornariam a conferencia impossivel: nao ha como saber em
-- qual gaveta o dinheiro entrou.
select throws_ok(
  $$ select public.open_cash_session(current_setting('tests.tenant')::uuid, 50) $$,
  '22023'::char(5),
  'Já existe um caixa aberto nesta unidade.',
  'nao se abre um segundo caixa com um aberto'
);

-- ---------------------------------------------------------------------------
-- Lancamentos no livro
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.record_finance_entry(
       current_setting('tests.tenant')::uuid, 'income', 80,
       'cash'::public.payment_method, 'Corte e barba') $$,
  'control — o operador financeiro lanca recebimento'
);

select lives_ok(
  $$ select public.record_finance_entry(
       current_setting('tests.tenant')::uuid, 'income', 120,
       'pix'::public.payment_method, 'Coloracao') $$,
  'control — recebimento em pix tambem entra no livro'
);

select lives_ok(
  $$ select public.record_finance_entry(
       current_setting('tests.tenant')::uuid, 'expense', 30,
       'cash'::public.payment_method, 'Produto de trabalho') $$,
  'control — despesa entra no mesmo livro'
);

select throws_ok(
  $$ select public.record_finance_entry(
       current_setting('tests.tenant')::uuid, 'income', 0,
       'cash'::public.payment_method, 'Nada') $$,
  '22023'::char(5),
  'O valor precisa ser maior que zero.',
  'lancamento de valor zero e recusado'
);

-- Os lancamentos se amarram ao caixa aberto.
select results_eq(
  $$ select count(*)::int from public.finance_entries
     where cash_session_id = current_setting('tests.session')::uuid $$,
  $$ values (3) $$,
  'os lancamentos se amarram ao caixa aberto'
);

-- ---------------------------------------------------------------------------
-- Fechamento: so dinheiro em especie passa pela gaveta
-- ---------------------------------------------------------------------------
-- 100 de abertura + 80 em especie - 30 de despesa = 150. Os 120 em pix NAO contam:
-- nao entraram na gaveta.

do $$
declare
  v_session public.cash_sessions;
begin
  select * into v_session
  from public.close_cash_session(current_setting('tests.session')::uuid, 150);
end;
$$;

select results_eq(
  $$ select expected_amount, counted_amount from public.cash_sessions
     where id = current_setting('tests.session')::uuid $$,
  $$ values (150::numeric(12,2), 150::numeric(12,2)) $$,
  'o esperado ignora pix e cartao — so o que passa pela gaveta'
);

select throws_ok(
  $$ select public.close_cash_session(current_setting('tests.session')::uuid, 150) $$,
  '22023'::char(5),
  'Este caixa já foi fechado.',
  'caixa fechado nao fecha de novo'
);

-- Fechado, abre outro.
select lives_ok(
  $$ select public.open_cash_session(current_setting('tests.tenant')::uuid, 150) $$,
  'control — fechado o anterior, um novo caixa abre'
);

-- ---------------------------------------------------------------------------
-- Quem ve dinheiro
-- ---------------------------------------------------------------------------
-- Diferente de automotive_work_order_payments, que qualquer membro le. Um tecnico
-- nao precisa saber quanto a empresa faturou.

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select id from public.finance_entries $$,
  'o tecnico nao le o livro financeiro'
);

select is_empty(
  $$ select id from public.cash_sessions $$,
  'o tecnico nao le o caixa'
);

select throws_ok(
  $$ select public.record_finance_entry(
       current_setting('tests.tenant')::uuid, 'income', 10,
       'cash'::public.payment_method, 'Indevido') $$,
  '42501'::char(5),
  'Only a finance operator can record finance entries',
  'o tecnico nao lanca no livro'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select isnt_empty(
  $$ select id from public.finance_entries $$,
  'control — o proprietario le o livro'
);

-- ---------------------------------------------------------------------------
-- Comissao ao concluir o atendimento
-- ---------------------------------------------------------------------------

update public.professionals
set commission_kind = 'percent', commission_percent = 40
where id = current_setting('tests.professional')::uuid;

do $$
declare
  v_appointment public.appointments;
begin
  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.professional')::uuid,
    '2027-01-06 13:00:00+00',
    null
  );

  perform set_config('tests.appointment', v_appointment.id::text, true);
  perform public.transition_staff_appointment(v_appointment.id, 'confirmed');
  perform public.transition_staff_appointment(v_appointment.id, 'in_progress');
end;
$$;

select is_empty(
  $$ select id from public.finance_entries
     where appointment_id = current_setting('tests.appointment')::uuid and is_commission $$,
  'a comissao nao e lancada antes de concluir'
);

do $$
begin
  perform public.transition_staff_appointment(current_setting('tests.appointment')::uuid, 'completed');
end;
$$;

-- O servico da fixture custa 120; 40% = 48.
select results_eq(
  $$ select kind::text, amount from public.finance_entries
     where appointment_id = current_setting('tests.appointment')::uuid and is_commission $$,
  $$ values ('expense'::text, 48::numeric(12,2)) $$,
  'a comissao e lancada como despesa ao concluir o atendimento'
);

-- ---------------------------------------------------------------------------
-- O pagamento da OS espelha no livro
-- ---------------------------------------------------------------------------
-- Sem isto haveria duas verdades sobre o mesmo dinheiro.

do $$
declare
  a jsonb := tests.build_tenant('caixa-auto', 'automotive_aesthetics');
begin
  perform set_config('tests.auto_tenant', a ->> 'tenant_id', true);
  perform set_config('tests.auto_owner', a ->> 'owner_id', true);
end;
$$;

select tests.clear_auth();
select tests.act_as(current_setting('tests.auto_owner')::uuid);

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.auto_tenant')::uuid, 'FIN-1A11', 'Cliente do livro'
  );

  perform public.add_automotive_work_order_item(
    v_work_order.id, 'service', 'Lavagem completa', 1, 90
  );
  perform public.record_automotive_work_order_payment(
    v_work_order.id, 'payment'::public.automotive_payment_kind,
    'pix'::public.automotive_payment_method, 90
  );

  perform set_config('tests.auto_wo', v_work_order.id::text, true);
end;
$$;

select results_eq(
  $$ select kind::text, method::text, amount from public.finance_entries
     where work_order_id = current_setting('tests.auto_wo')::uuid $$,
  $$ values ('income'::text, 'pix'::text, 90::numeric(12,2)) $$,
  'o pagamento da OS aparece no livro do nucleo, com o mesmo valor e meio'
);

select is_empty(
  $$ select id from public.finance_entries
     where work_order_id = current_setting('tests.auto_wo')::uuid
       and tenant_id <> current_setting('tests.auto_tenant')::uuid $$,
  'o espelhamento respeita o tenant da OS'
);

select tests.clear_auth();

select * from finish();
rollback;
