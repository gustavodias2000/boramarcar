-- Fecha três superfícies que a revisão de segurança apontou como P1.
--
-- As três compartilham uma característica: nenhuma delas quebra em teste hoje, porque
-- todas são "a política permite mais do que deveria" — e permitir demais nunca gera erro.

-- ---------------------------------------------------------------------------
-- 1. Criar empresa não tinha limite algum
-- ---------------------------------------------------------------------------
-- `create_business_with_owner` validava exatamente duas coisas: existe sessão, e o nome
-- tem 2+ caracteres. Cada chamada escreve ~18 linhas — empresa, vínculo, até 10 serviços
-- do catálogo, profissional, recurso de agenda e 6 regras de disponibilidade.
--
-- Somado a `enable_signup = true` e `enable_confirmations = false`, uma conta com e-mail
-- não verificado inflava o banco indefinidamente. Não é vazamento; é abuso de plataforma,
-- e custa dinheiro real de armazenamento.
--
-- O NÚMERO 5 É PALPITE MEU, não medição. Contado por `business_members` e não por
-- `businesses.created_by`, de propósito: quem transfere a posse recupera a cota, e quem
-- é convidado como dono conta. Se o produto quiser outro número, é uma linha.

create or replace function public.create_business_with_owner(
  p_name text,
  p_business_type public.business_type,
  p_timezone text default 'America/Sao_Paulo'
)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_business public.businesses;
  v_member_id uuid;
  v_professional_id uuid;
  v_nome text;
  v_profissional_nome text;
  v_weekday integer;
  v_slug text;
  v_empresas integer;
  v_recentes integer;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'É preciso estar autenticado para abrir uma empresa.'
      using errcode = '42501';
  end if;

  v_nome := nullif(trim(coalesce(p_name, '')), '');

  if v_nome is null or char_length(v_nome) < 2 then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;

  select count(*)
  into v_empresas
  from public.business_members member
  where member.user_id = v_user_id and member.role = 'owner' and member.active;

  if v_empresas >= 5 then
    raise exception
      'Cada conta pode manter até 5 empresas. Fale com o suporte se precisar de mais.'
      using errcode = '42501';
  end if;

  -- Pega script; não incomoda humano nenhum.
  select count(*)
  into v_recentes
  from public.businesses business
  where business.created_by = v_user_id
    and business.created_at > now() - interval '1 hour';

  if v_recentes >= 3 then
    raise exception 'Muitas empresas abertas em pouco tempo. Tente novamente mais tarde.'
      using errcode = '42501';
  end if;

  insert into public.businesses (name, business_type, timezone, created_by)
  values (
    v_nome,
    p_business_type,
    coalesce(nullif(trim(p_timezone), ''), 'America/Sao_Paulo'),
    v_user_id
  )
  returning * into v_business;

  v_slug := coalesce(nullif(left(public.slugify(v_nome), 32), ''), 'empresa');

  perform pg_advisory_xact_lock(hashtextextended('business_slug:' || v_slug, 0));

  if char_length(v_slug) < 3
     or v_slug in ('api', 'admin', 'app', 'auth', 'login', 'entrar', 'sair', 'cadastro',
                   'novo', 'nova', 'inicio', 'conta', 'ajuda', 'suporte', 'sobre',
                   'termos', 'privacidade', 'static', 'comecar', 'e')
     or exists (select 1 from public.businesses outro where outro.slug = v_slug) then
    v_slug := left(v_slug, 25) || '-' || left(replace(v_business.id::text, '-', ''), 6);
  end if;

  update public.businesses business
  set slug = v_slug
  where business.id = v_business.id
  returning * into v_business;

  insert into public.business_members (tenant_id, user_id, role, added_by)
  values (v_business.id, v_user_id, 'owner', v_user_id)
  returning id into v_member_id;

  insert into public.services (tenant_id, name, duration_minutes, base_price, created_by)
  select v_business.id, padrao.name, padrao.duration_minutes, 0, v_user_id
  from public.segment_default_services padrao
  where padrao.business_type = p_business_type
  order by padrao.display_order;

  select nullif(trim(profile.display_name), '')
  into v_profissional_nome
  from public.profiles profile
  where profile.id = v_user_id;

  insert into public.professionals (tenant_id, business_member_id, name, created_by)
  values (v_business.id, v_member_id, coalesce(v_profissional_nome, v_nome), v_user_id)
  returning id into v_professional_id;

  for v_weekday in 1..6 loop
    insert into public.professional_schedule_rules (
      tenant_id, professional_id, weekday, starts_at, ends_at, created_by
    )
    values (v_business.id, v_professional_id, v_weekday, '09:00', '18:00', v_user_id);
  end loop;

  return v_business;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Criar empresa passa a ter um caminho só
-- ---------------------------------------------------------------------------
-- O limite acima é inútil enquanto existir INSERT direto em `businesses`, que não passa
-- por ele. E o caminho direto também permitia criar empresa SEM dono: inserir a linha e
-- nunca criar o vínculo deixa um registro que só o criador enxerga e que ninguém
-- administra.
--
-- A ordem aqui não é estética: `business_members_insert_owner_only` referencia
-- `can_claim_initial_tenant_owner` no `with check`, o Postgres registra a dependência, e
-- o `drop function` falharia. A política precisa perder a referência antes.

drop policy if exists businesses_insert_creator_only on public.businesses;
revoke insert on public.businesses from authenticated;

drop policy if exists business_members_insert_owner_only on public.business_members;

create policy business_members_insert_owner_only
on public.business_members for insert to authenticated
with check (public.is_tenant_owner(tenant_id));

-- Sai sem substituto porque não tem uso futuro: a última cláusula do corpo dela exige
-- ZERO membros na empresa, e convite de membro é o caso oposto por definição. A
-- 20260825000300 já havia registrado por escrito que ela não serve nem para recuperar
-- empresa órfã, e foi por isso que aquela migration criou um gatilho em vez de usá-la.
drop function if exists public.can_claim_initial_tenant_owner(uuid, uuid, public.business_role);

-- ---------------------------------------------------------------------------
-- 3. A agenda inteira era legível por qualquer membro
-- ---------------------------------------------------------------------------
-- `appointments_select_member` nunca foi redefinida desde a fundação. Numa barbearia com
-- dois barbeiros, o segundo lê a agenda inteira — inclusive `notes`, que é texto livre
-- preenchido pela recepção e o campo mais provável de acumular dado pessoal de verdade.
--
-- É o mesmo raciocínio que o projeto já aplicou a `scheduling_resource_reservations.reason`
-- na 20260825000900. O precedente interno existe; falta aplicá-lo aqui.
--
-- O CAIXA CONTINUA VENDO A AGENDA. `is_tenant_scheduler` não inclui `cashier`, então sem
-- o segundo ramo ele perderia a tela que usa para cobrar. Decisão de produto, tomada aqui
-- com o padrão mais conservador: quem tem motivo de dinheiro vê quem foi atendido.

drop policy if exists appointments_select_member on public.appointments;

create policy appointments_select_operational
on public.appointments for select to authenticated
using (
  public.is_tenant_scheduler(tenant_id)
  or public.is_tenant_finance_operator(tenant_id)
  or public.is_current_user_professional(professional_id, tenant_id)
);

-- Pagamento de OS seguia legível por qualquer membro, enquanto `finance_entries` já era
-- restrito — duas regras para o mesmo tipo de dado no mesmo produto. O comentário da
-- 20260825001700 já registrava a inconsistência como conhecida.

drop policy if exists automotive_work_order_payments_select_member
  on public.automotive_work_order_payments;

create policy automotive_work_order_payments_select_finance
on public.automotive_work_order_payments for select to authenticated
using (public.is_tenant_finance_operator(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. O comentário que mentia
-- ---------------------------------------------------------------------------
-- `businesses_select_member_or_creator` afirma no comentário acima dela que o criador lê
-- "apenas até o primeiro vínculo ser inserido". A política é um `or` sem qualificação
-- temporal: o fundador que transferiu a posse e foi removido continua lendo a linha.
--
-- Com o INSERT direto fechado no item 2, a janela que a cláusula existia para cobrir
-- deixou de existir — `create_business_with_owner` cria empresa e vínculo na mesma
-- transação. A cláusula pode sair.

drop policy if exists businesses_select_member_or_creator on public.businesses;

create policy businesses_select_member
on public.businesses for select to authenticated
using (public.is_active_business_member(id));

comment on function public.create_business_with_owner(text, public.business_type, text) is
  'Abre a empresa com posse, endereço, catálogo da categoria, o dono como primeiro '
  'profissional e disponibilidade padrão — numa transação. É o ÚNICO caminho de criação: '
  'o INSERT direto foi revogado, e é aqui que o limite por conta mora.';
