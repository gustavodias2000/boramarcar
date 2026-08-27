-- As tres superficies fechadas na 20260826000500.
--
-- Todas tem a mesma natureza: "a politica permitia mais do que devia". Permitir demais
-- nunca gera erro, entao sem estas asercoes a regressao seria silenciosa.

begin;
select * from no_plan();

do $$
declare
  t jsonb := tests.build_tenant('fechada', 'barbershop');
begin
  perform set_config('tests.tenant', t ->> 'tenant_id', true);
  perform set_config('tests.owner', t ->> 'owner_id', true);
  perform set_config('tests.receptionist', t ->> 'receptionist_id', true);
  perform set_config('tests.cashier', t ->> 'cashier_id', true);
  perform set_config('tests.technician', t ->> 'technician_id', true);
  perform set_config('tests.technician_member', t ->> 'technician_member_id', true);
  perform set_config('tests.customer', t ->> 'customer_id', true);
  perform set_config('tests.professional', t ->> 'professional_id', true);
  perform set_config('tests.service', t ->> 'service_id', true);
  perform set_config('tests.outsider', t ->> 'outsider_id', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar empresa tem um caminho so, e ele tem limite
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.outsider')::uuid);

select throws_ok(
  $$ insert into public.businesses (name, business_type, created_by)
     values ('Por fora', 'barbershop', (select auth.uid())) $$,
  '42501'::char(5),
  null::text,
  'nao se cria empresa por INSERT direto — o limite mora na RPC'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'businesses' and cmd = 'INSERT' $$,
  'e a politica que permitia isso saiu junto'
);

-- A funcao que so servia ao INSERT direto some com ele. Ela exigia ZERO membros na
-- empresa, entao nunca poderia servir a convite de membro, que e o caso oposto.
select is_empty(
  $$ select p.proname::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_claim_initial_tenant_owner' $$,
  'can_claim_initial_tenant_owner some, porque ficou sem consumidor legitimo'
);

select lives_ok(
  $$ select public.create_business_with_owner('Barbearia Um', 'barbershop') $$,
  'control — a RPC continua abrindo empresa'
);

do $$
begin
  perform public.create_business_with_owner('Barbearia Dois', 'barbershop');
  perform public.create_business_with_owner('Barbearia Tres', 'barbershop');
end;
$$;

-- Tres na mesma hora e o teto da janela de taxa. A quarta para.
--
-- NOTA HONESTA: o limite de 5 empresas por conta NAO e exercitado aqui, e nao pode ser
-- sem manipular `created_at` — a janela de taxa dispara antes, na quarta. O que este
-- teste prova e a janela; o teto de 5 esta so no codigo.
select throws_like(
  $$ select public.create_business_with_owner('Barbearia Quatro', 'barbershop') $$,
  '%pouco tempo%',
  'abrir empresa em rajada e barrado'
);

-- ---------------------------------------------------------------------------
-- O endereco da empresa
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select slug from public.businesses where name = 'Barbearia Um' $$,
  $$ values ('barbearia-um'::text) $$,
  'a empresa nasce com endereco legivel, derivado do nome'
);

-- Controle da asercao seguinte: as duas empresas existem MESMO, entao a prova de que
-- nenhum endereco se repete nao esta passando por lista vazia.
select results_eq(
  $$ select count(*)::int from public.businesses
     where name in ('Barbearia Um', 'Barbearia Dois') $$,
  $$ values (2) $$,
  'control — as duas empresas existem, entao a prova de unicidade abaixo tem sobre o que falar'
);

select is_empty(
  $$ select slug from public.businesses group by slug having count(*) > 1 $$,
  'nenhum endereco se repete'
);

select throws_ok(
  $$ update public.businesses set slug = 'outro'
     where name = 'Barbearia Um' $$,
  '42501'::char(5),
  null::text,
  'o endereco nao se reescreve por UPDATE direto'
);

select throws_ok(
  $$ update public.businesses set business_type = 'automotive_aesthetics'
     where name = 'Barbearia Um' $$,
  '42501'::char(5),
  null::text,
  'nem o segmento — trocar isso mudaria o conjunto de features de um tenant vivo'
);

select lives_ok(
  $$ update public.businesses set name = 'Barbearia Um e Meio'
     where name = 'Barbearia Um' $$,
  'control — renomear a empresa continua permitido'
);

-- A empresa vive na RAIZ da URL, entao o nome dela divide espaco com toda rota de
-- produto. Uma empresa chamada "Suporte" quebraria `/suporte` no dia em que ele existir.
select results_eq(
  $$ select public.endereco_reservado('suporte'),
            public.endereco_reservado('precos'),
            public.endereco_reservado('barbearia-do-ze') $$,
  $$ values (true, true, false) $$,
  'a lista reservada cobre o que existe E o que provavelmente vai existir'
);

select throws_ok(
  $$ select public.set_business_slug(
       (select id from public.businesses where name = 'Barbearia Dois'), 'precos') $$,
  '22023'::char(5),
  'Este endereço é reservado. Escolha outro.',
  'nao se toma um endereco reservado'
);

-- Recusar a abertura seria pior que um endereco feio: a empresa chamada "Suporte" existe
-- de verdade e precisa entrar.
--
-- Usuario NOVO de proposito: o anterior ja esgotou a janela de tres por hora acima, e
-- reaproveita-lo faria este teste falhar pelo motivo errado.
select tests.clear_auth();

do $$
begin
  perform set_config('tests.dono_suporte',
    tests.create_user('suporte-' || gen_random_uuid() || '@example.invalid')::text, true);
end;
$$;

select tests.act_as(current_setting('tests.dono_suporte')::uuid);

do $$
declare
  v_business public.businesses;
begin
  select * into v_business
  from public.create_business_with_owner('Suporte', 'barbershop');
  perform set_config('tests.reservada', v_business.slug, true);
end;
$$;

select ok(
  current_setting('tests.reservada') like 'suporte-%'
    and current_setting('tests.reservada') <> 'suporte',
  'nome que colide com rota reservada ganha sufixo, e a empresa abre assim mesmo'
);

-- ---------------------------------------------------------------------------
-- A agenda deixa de ser legivel por qualquer membro
-- ---------------------------------------------------------------------------

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

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
    '2027-05-11 13:00:00+00',
    'Observacao livre da recepcao'
  );
  perform set_config('tests.appointment', v_appointment.id::text, true);
end;
$$;

select isnt_empty(
  $$ select id from public.appointments
     where id = current_setting('tests.appointment')::uuid $$,
  'control — a recepcao e a gerencia continuam vendo a agenda inteira'
);

-- O caixa cobra, entao precisa saber quem foi atendido. Sem o segundo ramo da politica
-- ele teria perdido a tela.
select tests.clear_auth();
select tests.act_as(current_setting('tests.cashier')::uuid);

select isnt_empty(
  $$ select id from public.appointments
     where id = current_setting('tests.appointment')::uuid $$,
  'control — o caixa continua vendo a agenda, porque e dela que ele cobra'
);

-- O tecnico nao e o profissional deste atendimento, entao nao o alcanca — junto com o
-- campo `notes`, que e texto livre e o mais provavel de acumular dado pessoal.
select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select is_empty(
  $$ select id from public.appointments $$,
  'o profissional nao le agendamento que nao e dele'
);

-- Controle positivo: o mesmo profissional, no proprio atendimento, ve.
select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

do $$
declare
  v_prof uuid;
begin
  insert into public.professionals (tenant_id, business_member_id, name, created_by)
  values (
    current_setting('tests.tenant')::uuid,
    current_setting('tests.technician_member')::uuid,
    'Profissional do tecnico',
    current_setting('tests.owner')::uuid
  )
  returning id into v_prof;

  perform public.set_professional_schedule_rule(
    current_setting('tests.tenant')::uuid, v_prof, 2, '09:00', '18:00'
  );

  perform set_config('tests.prof_tecnico', v_prof::text, true);
end;
$$;

do $$
declare
  v_appointment public.appointments;
begin
  select * into v_appointment
  from public.create_staff_appointment(
    current_setting('tests.tenant')::uuid,
    current_setting('tests.customer')::uuid,
    current_setting('tests.service')::uuid,
    current_setting('tests.prof_tecnico')::uuid,
    '2027-05-11 15:00:00+00',
    null
  );
  perform set_config('tests.appointment_tecnico', v_appointment.id::text, true);
end;
$$;

select tests.clear_auth();
select tests.act_as(current_setting('tests.technician')::uuid);

select results_eq(
  $$ select count(*)::int from public.appointments $$,
  $$ values (1) $$,
  'control — ele ve exatamente um: o proprio'
);

select results_eq(
  $$ select id from public.appointments $$,
  $$ select current_setting('tests.appointment_tecnico')::uuid $$,
  'e e o dele, nao o do colega'
);

-- ---------------------------------------------------------------------------
-- Pagamento de OS deixa de ser legivel por qualquer membro
-- ---------------------------------------------------------------------------
-- Antes havia duas regras para o mesmo tipo de dado: `finance_entries` era restrito e
-- `automotive_work_order_payments` nao.

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'automotive_work_order_payments'
       and policyname = 'automotive_work_order_payments_select_member' $$,
  'a politica que liberava pagamento de OS a qualquer membro saiu'
);

-- ---------------------------------------------------------------------------
-- O criador sem vinculo deixa de ler a empresa
-- ---------------------------------------------------------------------------
-- A politica antiga tinha um `or created_by = auth.uid()` que o comentario dela descrevia
-- como temporario e que nao era: o fundador que transferiu a posse continuava lendo.

select tests.clear_auth();
select tests.act_as(current_setting('tests.owner')::uuid);

select isnt_empty(
  $$ select id from public.businesses where id = current_setting('tests.tenant')::uuid $$,
  'control — quem tem vinculo ativo le a empresa'
);

select tests.clear_auth();
select tests.act_as(current_setting('tests.outsider')::uuid);

select is_empty(
  $$ select id from public.businesses where id = current_setting('tests.tenant')::uuid $$,
  'quem nao tem vinculo nao le empresa alheia'
);

select tests.clear_auth();

select * from finish();
rollback;
