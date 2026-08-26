-- LGPD: segregacao de dado pessoal, consentimento, anonimizacao e desligamento.
-- Cobre os achados C-8, C-11 e C-12.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('lgpd', 'automotive_aesthetics');
  o jsonb := tests.build_tenant('lgpd-outro', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.receptionist', t ->> 'receptionist_id', true);
  perform set_config('tests.cashier', t ->> 'cashier_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);

  perform set_config('tests.other_tenant', o ->> 'tenant_id', true);
  perform set_config('tests.other_owner', o ->> 'owner_id', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- C-8 — o dado pessoal saiu da mesa de quem nao precisa dele
-- ---------------------------------------------------------------------------
-- Antes: qualquer membro lia CPF, telefone, e-mail e aniversario de todo cliente.

select has_table('public', 'customer_contacts', 'existe a tabela segregada de dado pessoal');

select hasnt_column(
  'public', 'customers', 'cpf_cnpj',
  'o CPF saiu do cadastro operacional'
);
select hasnt_column(
  'public', 'customers', 'whatsapp',
  'o whatsapp saiu do cadastro operacional'
);
select hasnt_column(
  'public', 'customers', 'email',
  'o e-mail saiu do cadastro operacional'
);
select hasnt_column(
  'public', 'customers', 'birthday',
  'a data de nascimento saiu do cadastro operacional'
);

-- O nome fica: a OS precisa mostrar de quem e o carro.
select has_column('public', 'customers', 'name', 'o nome continua no cadastro operacional');

select tests.act_as(current_setting('tests.receptionist')::uuid);

select isnt_empty(
  $$ select customer_id from public.customer_contacts
     where customer_id = current_setting('tests.customer')::uuid $$,
  'control — a recepcao le o dado pessoal, porque e ela quem contata o cliente'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select customer_id from public.customer_contacts $$,
  'o tecnico nao le nenhum dado pessoal de cliente (C-8)'
);

select isnt_empty(
  $$ select id from public.customers where id = current_setting('tests.customer')::uuid $$,
  'control — o tecnico continua vendo o nome do cliente, que e o que a operacao exige'
);

select throws_ok(
  $$ select public.upsert_customer_contact(
       current_setting('tests.customer')::uuid, null, '11888887777') $$,
  '42501'::char(5),
  'Only a scheduler can write customer contact data',
  'o tecnico tambem nao escreve dado pessoal'
);

-- O caixa ve dinheiro, nao ve pessoa. Sao permissoes diferentes de proposito.
select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select is_empty(
  $$ select customer_id from public.customer_contacts $$,
  'o caixa nao le dado pessoal de cliente'
);

-- Isolamento entre empresas continua valendo na tabela nova.
select tests.clear_auth();
select tests.act_as(current_setting('tests.other_owner')::uuid);

select is_empty(
  $$ select customer_id from public.customer_contacts
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  'outra empresa nao alcanca o dado pessoal desta'
);

-- ---------------------------------------------------------------------------
-- Minimizacao: aniversario sem ano
-- ---------------------------------------------------------------------------
-- Vem do Barbershop. Permite a campanha de aniversariantes sem guardar a idade.

select tests.clear_auth();
select tests.act_as(current_setting('tests.receptionist')::uuid);

select results_eq(
  $$ select birthday_md from public.customer_contacts
     where customer_id = current_setting('tests.customer')::uuid $$,
  $$ values ('03-14'::text) $$,
  'o aniversario e guardado como mes-dia, sem o ano'
);

select throws_ok(
  $$ update public.customer_contacts set birthday_md = '1990-03-14'
     where customer_id = current_setting('tests.customer')::uuid $$,
  '23514'::char(5),
  null::text,
  'gravar o ano de nascimento e recusado pelo schema'
);

-- ---------------------------------------------------------------------------
-- Consentimento por finalidade
-- ---------------------------------------------------------------------------
-- Principio do Barbershop: ausente significa opt-in pendente, nunca autorizacao
-- implicita. Por isso nao existe default `true` em lugar nenhum.

select is_empty(
  $$ select id from public.customer_consents
     where customer_id = current_setting('tests.customer')::uuid $$,
  'cliente novo nasce sem nenhum consentimento — ausencia nao e autorizacao'
);

select col_hasnt_default(
  'public', 'customer_consents', 'granted',
  'consentimento nao tem valor padrao: alguem precisa ter dito sim'
);

select lives_ok(
  $$ insert into public.customer_consents (tenant_id, customer_id, purpose, granted)
     values (current_setting('tests.tenant')::uuid,
             current_setting('tests.customer')::uuid, 'marketing_whatsapp', true) $$,
  'control — a recepcao registra o consentimento de marketing'
);

-- Consentir em receber a confirmacao do agendamento nao e consentir em promocao.
select is_empty(
  $$ select id from public.customer_consents
     where customer_id = current_setting('tests.customer')::uuid
       and purpose = 'marketing_email' $$,
  'consentir numa finalidade nao consente nas outras'
);

select throws_ok(
  $$ insert into public.customer_consents (tenant_id, customer_id, purpose, granted)
     values (current_setting('tests.tenant')::uuid,
             current_setting('tests.customer')::uuid, 'marketing_whatsapp', false) $$,
  '23505'::char(5),
  null::text,
  'ha um registro por finalidade, nao um historico duplicado'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select id from public.customer_consents $$,
  'o tecnico nao le consentimento'
);

-- ---------------------------------------------------------------------------
-- C-11 — desligar profissional, ja que apagar e impossivel
-- ---------------------------------------------------------------------------
-- A politica antiga concedia DELETE que o schema sempre recusava com 23503.

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'professionals' and cmd = 'DELETE' $$,
  'nao ha mais politica de DELETE prometendo o que o schema impede (C-11)'
);

select ok(
  not has_table_privilege('authenticated', 'public.professionals', 'DELETE'),
  'authenticated nao tem sequer o privilegio de DELETE em professionals'
);

-- Desligar alguem com agenda marcada deixaria clientes esperando por quem nao vem.
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
    '2027-03-10 13:00:00+00',
    null
  );
  perform set_config('tests.appointment', v_appointment.id::text, true);
end;
$$;

select throws_like(
  $$ select public.deactivate_professional(current_setting('tests.professional')::uuid) $$,
  '%atendimento(s) futuro(s)%',
  'nao se desliga profissional com atendimento futuro na agenda'
);

do $$
begin
  perform public.transition_staff_appointment(
    current_setting('tests.appointment')::uuid, 'cancelled'
  );
end;
$$;

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.deactivate_professional(current_setting('tests.professional')::uuid) $$,
  '42501'::char(5),
  'Only an administrator can deactivate a professional',
  'o tecnico nao desliga ninguem — nem a si mesmo'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select lives_ok(
  $$ select public.deactivate_professional(current_setting('tests.professional')::uuid) $$,
  'control — cancelada a agenda, o proprietario desliga o profissional'
);

select results_eq(
  $$ select active from public.professionals
     where id = current_setting('tests.professional')::uuid $$,
  $$ values (false) $$,
  'o profissional fica inativo em vez de sumir, e o historico dele continua inteiro'
);

-- Desligado, deixa de ser reservavel: senao a agenda continuaria oferecendo o horario.
select is_empty(
  $$ select id from public.scheduling_resources
     where professional_id = current_setting('tests.professional')::uuid and active $$,
  'o recurso de agenda acompanha o desligamento'
);

-- ---------------------------------------------------------------------------
-- C-12 — anonimizar em vez de apagar
-- ---------------------------------------------------------------------------
-- Apagar o cliente levaria junto o registro fiscal do que foi vendido a ele. A
-- resposta correta em LGPD e outra: o dado pessoal some, o fato comercial fica.

do $$
declare
  v_work_order public.automotive_work_orders;
begin
  select * into v_work_order
  from public.open_automotive_walk_in_work_order(
    current_setting('tests.tenant')::uuid, 'LGP-2C22', 'Cliente a esquecer', '11977776666'
  );
  perform set_config('tests.wo', v_work_order.id::text, true);
  perform set_config('tests.wo_customer',
    (select customer_id from public.automotive_work_orders where id = v_work_order.id)::text,
    true
  );
end;
$$;

-- A entrada rapida deixou de gravar telefone em `customers`; grava no lugar certo.
select results_eq(
  $$ select whatsapp from public.customer_contacts
     where customer_id = current_setting('tests.wo_customer')::uuid $$,
  $$ values ('11977776666'::text) $$,
  'a entrada rapida grava o telefone ja segregado'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.anonymize_customer(current_setting('tests.wo_customer')::uuid) $$,
  '42501'::char(5),
  'Only an administrator can anonymize a customer',
  'o tecnico nao anonimiza cliente'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select lives_ok(
  $$ select public.anonymize_customer(
       current_setting('tests.wo_customer')::uuid, 'pedido do titular') $$,
  'control — o proprietario atende ao pedido de esquecimento'
);

select is_empty(
  $$ select customer_id from public.customer_contacts
     where customer_id = current_setting('tests.wo_customer')::uuid $$,
  'o dado pessoal do titular desaparece'
);

select isnt_empty(
  $$ select id from public.automotive_work_orders
     where id = current_setting('tests.wo')::uuid $$,
  'a OS permanece: o fato comercial nao e dado pessoal e tem retencao propria'
);

select results_eq(
  $$ select name like 'Cliente anonimizado %', active, anonymized_at is not null
     from public.customers where id = current_setting('tests.wo_customer')::uuid $$,
  $$ values (true, false, true) $$,
  'o cadastro fica sem nome identificavel, inativo e marcado como anonimizado'
);

-- Idempotente: pedir duas vezes nao produz um segundo evento nem um erro.
select lives_ok(
  $$ select public.anonymize_customer(current_setting('tests.wo_customer')::uuid) $$,
  'anonimizar de novo nao quebra'
);

select throws_ok(
  $$ select public.upsert_customer_contact(
       current_setting('tests.wo_customer')::uuid, null, '11900000000') $$,
  '22023'::char(5),
  'Este cliente foi anonimizado e não aceita novo dado pessoal.',
  'anonimizado nao volta a receber dado pessoal por descuido'
);

-- ---------------------------------------------------------------------------
-- Trilha de auditoria
-- ---------------------------------------------------------------------------
-- Trilha que o auditado pode escrever ou apagar nao e trilha.

select results_eq(
  $$ select count(*)::int from public.audit_log
     where action = 'anonymize' and entity = 'customer'
       and entity_id = current_setting('tests.wo_customer')::uuid $$,
  $$ values (1) $$,
  'a anonimizacao deixa exatamente um registro na trilha'
);

select isnt_empty(
  $$ select id from public.audit_log
     where action = 'deactivate' and entity = 'professional' $$,
  'o desligamento tambem fica registrado'
);

select throws_ok(
  $$ insert into public.audit_log (tenant_id, action, entity)
     values (current_setting('tests.tenant')::uuid, 'forjado', 'customer') $$,
  '42501'::char(5),
  null::text,
  'ninguem escreve na trilha por fora — so as funcoes SECURITY DEFINER'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select id from public.audit_log $$,
  'o tecnico nao le a trilha'
);

-- ---------------------------------------------------------------------------
-- Retencao declarada
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select lives_ok(
  $$ update public.businesses set data_retention_months = 60
     where id = current_setting('tests.tenant')::uuid $$,
  'control — a empresa declara o prazo de retencao'
);

select throws_ok(
  $$ update public.businesses set data_retention_months = 2
     where id = current_setting('tests.tenant')::uuid $$,
  '23514'::char(5),
  null::text,
  'prazo fora da faixa razoavel e recusado'
);

-- ---------------------------------------------------------------------------
-- C-12 — a outra metade: excluir a empresa
-- ---------------------------------------------------------------------------
-- No CASCADE de `businesses` o Postgres nao garante ordem, e qualquer FK RESTRICT
-- interna ao tenant pode ser checada antes do filho sumir. Por isso o offboarding e
-- explicito: das folhas para a raiz, numa transacao.
--
-- Este teste falha se alguem acrescentar tabela com tenant_id e esquecer de incluir na
-- funcao. E de proposito.

select ok(
  not has_table_privilege('authenticated', 'public.businesses', 'DELETE'),
  'nao ha DELETE solto em businesses: encerrar empresa tem um caminho so'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select throws_ok(
  $$ select public.delete_business(current_setting('tests.tenant')::uuid, 'lgpd') $$,
  '42501'::char(5),
  'Only the owner can delete the business',
  'so o proprietario encerra a empresa'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select throws_ok(
  $$ select public.delete_business(current_setting('tests.tenant')::uuid, 'nome errado') $$,
  '22023'::char(5),
  'Confirme digitando o nome exato da empresa.',
  'digitar o nome errado nao apaga nada'
);

select isnt_empty(
  $$ select id from public.businesses where id = current_setting('tests.tenant')::uuid $$,
  'control — apos a recusa a empresa continua la'
);

-- A empresa tem OS paga, entrega, agendamento, cliente anonimizado, trilha e caixa:
-- exatamente o cenario que o C-12 dizia ser impossivel de excluir.
select lives_ok(
  $$ select public.delete_business(
       current_setting('tests.tenant')::uuid,
       (select name from public.businesses
        where id = current_setting('tests.tenant')::uuid)) $$,
  'empresa com historico completo e excluida (C-12)'
);

select is_empty(
  $$ select id from public.businesses where id = current_setting('tests.tenant')::uuid $$,
  'a empresa desaparece'
);

select is_empty(
  $$ select id from public.automotive_work_orders
     where tenant_id = current_setting('tests.tenant')::uuid $$,
  'e nao sobra OS orfa apontando para uma empresa que nao existe mais'
);

-- A outra empresa nao foi tocada: a exclusao respeita a fronteira do tenant.
select isnt_empty(
  $$ select id from public.businesses where id = current_setting('tests.other_tenant')::uuid $$,
  'control — a empresa vizinha continua intacta'
);

select tests.clear_auth();

select * from finish();
rollback;
