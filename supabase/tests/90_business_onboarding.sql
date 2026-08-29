-- Etapa 5 — abertura de empresa e catálogo por categoria.
--
-- É o teste da arquitetura multi-categoria. Se o núcleo estiver certo, abrir uma
-- barbearia é escolher um valor de enum e receber tudo pronto — sem código específico
-- de barbearia em lugar nenhum.

begin;
select * from no_plan();

-- Um usuário autenticado SEM empresa nenhuma. É o estado real de quem acabou de se
-- cadastrar, e o que travava a aplicação inteira antes desta etapa.
do $$
begin
  perform set_config('tests.novo_usuario', tests.create_user('abre-empresa@example.invalid')::text, true);
end;
$$;

select tests.act_as(current_setting('tests.novo_usuario')::uuid);

-- ---------------------------------------------------------------------------
-- Antes de abrir: nada
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select id from public.businesses $$,
  'quem acabou de se cadastrar nao enxerga empresa nenhuma'
);

select isnt_empty(
  $$ select name from public.segment_default_services where business_type = 'barbershop' $$,
  'control — o catalogo sugerido e legivel antes de existir empresa'
);

-- ---------------------------------------------------------------------------
-- Abrir uma barbearia
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.create_business_with_owner('A', 'barbershop') $$,
  '22023'::char(5),
  'Informe o nome da empresa.',
  'nome curto demais e recusado'
);

do $$
declare
  v_business public.businesses;
begin
  select * into v_business
  from public.create_business_with_owner('Barbearia do Centro', 'barbershop');

  perform set_config('tests.barbearia', v_business.id::text, true);
end;
$$;

select results_eq(
  $$ select name, business_type::text from public.businesses
     where id = current_setting('tests.barbearia')::uuid $$,
  $$ values ('Barbearia do Centro'::text, 'barbershop'::text) $$,
  'a empresa nasce com o nome e a categoria informados'
);

-- Quem abriu vira proprietário na mesma transação. Sem isso a empresa nasceria órfã.
select results_eq(
  $$ select role::text, active from public.business_members
     where tenant_id = current_setting('tests.barbearia')::uuid $$,
  $$ values ('owner'::text, true) $$,
  'quem abriu a empresa vira proprietario ativo'
);

-- ---------------------------------------------------------------------------
-- O catalogo da categoria vem junto
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select count(*)::int from public.services
     where tenant_id = current_setting('tests.barbearia')::uuid $$,
  $$ select count(*)::int from public.segment_default_services
     where business_type = 'barbershop' $$,
  'a barbearia recebe exatamente o catalogo sugerido da categoria'
);

select isnt_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.barbearia')::uuid
       and name = 'Corte e barba'
       and duration_minutes = 60 $$,
  'o servico chega com a duracao tipica, que e do que a agenda depende'
);

-- Preço zerado de propósito: duração é universal, preço varia por praça.
select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.barbearia')::uuid
       and base_price <> 0 $$,
  'os precos nascem zerados — quem abriu precifica'
);

-- Nenhum serviço automotivo escapou para a barbearia.
select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.barbearia')::uuid
       and name in ('Vitrificação', 'Polimento técnico', 'Lavagem detalhada') $$,
  'a barbearia nao recebe servico de outra categoria'
);

-- ---------------------------------------------------------------------------
-- A mesma porta serve qualquer categoria
-- ---------------------------------------------------------------------------
-- É esta asserção que prova a arquitetura: nenhuma linha de código é específica de
-- barbearia, de manicure ou de estética automotiva.

do $$
declare
  v_business public.businesses;
begin
  select * into v_business
  from public.create_business_with_owner('Estúdio de Unhas', 'manicure');
  perform set_config('tests.manicure', v_business.id::text, true);

  select * into v_business
  from public.create_business_with_owner('Detail Garage', 'automotive_aesthetics');
  perform set_config('tests.automotiva', v_business.id::text, true);
end;
$$;

select results_eq(
  $$ select count(*)::int from public.services
     where tenant_id = current_setting('tests.manicure')::uuid $$,
  $$ select count(*)::int from public.segment_default_services where business_type = 'manicure' $$,
  'a manicure recebe o proprio catalogo pela mesma funcao'
);

select results_eq(
  $$ select count(*)::int from public.services
     where tenant_id = current_setting('tests.automotiva')::uuid $$,
  $$ values (19) $$,
  'a estetica automotiva recebe os 19 servicos do §23 do Contexto Mestre'
);

-- Um usuário com três empresas: o modelo multiempresa do §7 funcionando de verdade.
select results_eq(
  $$ select count(*)::int from public.business_members
     where user_id = current_setting('tests.novo_usuario')::uuid and role = 'owner' $$,
  $$ values (3) $$,
  'o mesmo usuario pode ser dono de empresas de categorias diferentes'
);

-- ---------------------------------------------------------------------------
-- Isolamento continua valendo
-- ---------------------------------------------------------------------------

-- Criar usuario escreve em auth.users, o que exige o papel da sessao: `tests.create_user`
-- e SECURITY INVOKER de proposito, para o teste nao ganhar poder que a aplicacao nao tem.
select tests.clear_auth();

do $$
begin
  perform set_config('tests.estranho', tests.create_user('estranho@example.invalid')::text, true);
end;
$$;

select tests.act_as(current_setting('tests.estranho')::uuid);

select is_empty(
  $$ select id from public.services
     where tenant_id = current_setting('tests.barbearia')::uuid $$,
  'quem nao e membro nao enxerga o catalogo da barbearia'
);

select tests.clear_auth();
select tests.act_as_anon();

-- `anon` nem chega a executar a funcao: o grant e so para `authenticated`. O 42501
-- vem do privilegio, nao da checagem interna — e as duas barreiras valem.
select throws_ok(
  $$ select public.create_business_with_owner('Empresa Anonima', 'barbershop') $$,
  '42501'::char(5),
  null::text,
  'anon nao abre empresa'
);

select tests.clear_auth();

select * from finish();
rollback;
