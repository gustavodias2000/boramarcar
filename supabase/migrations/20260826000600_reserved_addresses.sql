-- A empresa passa a viver na raiz da URL: `boramarca.com/barbearia-do-ze/agenda`.
--
-- Decisão do dono em 26/08/2026, contra o `/e/[empresa]` que eu havia implementado. É a
-- forma que as pessoas já conhecem de Instagram, Calendly e Linktree, e o endereço vai
-- ser compartilhado por WhatsApp — cada segmento a mais é atrito real.
--
-- O PREÇO, e é este arquivo:
--
-- Com a empresa na raiz, o nome dela divide espaço de nomes com toda rota do produto.
-- Criar `/precos` amanhã quebra a empresa que já se chame assim — e "quebra" aqui não é
-- erro de tela: é link salvo, link compartilhado e endereço impresso em cartão que param
-- de funcionar.
--
-- Por isso a lista nasce GENEROSA em vez de mínima. Reservar palavra que talvez nunca se
-- use custa nada; deixar de reservar custa migração de dados. A lista anterior tinha 20
-- entradas e cobria só o que já existia — o que é exatamente a forma errada de montá-la.

create or replace function public.endereco_reservado(p_slug text)
returns boolean
language sql
immutable
strict
as $$
  select lower(trim(p_slug)) in (
    -- o que já existe
    'e', 'entrar', 'sair', 'cadastro', 'comecar', 'inicio', 'conta', 'privacidade',
    -- o que provavelmente vai existir
    'precos', 'planos', 'assinatura', 'cobranca', 'faturas', 'ajuda', 'suporte',
    'contato', 'sobre', 'termos', 'blog', 'novidades', 'status', 'docs', 'painel',
    'config', 'configuracoes', 'notificacoes', 'buscar', 'explorar', 'convite',
    'onboarding',
    -- técnico e reservado por convenção da web
    'api', 'admin', 'app', 'auth', 'login', 'logout', 'static', 'assets', 'public',
    '_next', 'favicon', 'robots', 'sitemap', 'well-known', 'novo', 'nova'
  );
$$;

comment on function public.endereco_reservado(text) is
  'Nenhuma empresa pode se chamar assim, porque colidiria com uma rota do produto. '
  'Espelha `ROTAS_RESERVADAS` em `packages/core/src/routing/index.ts` — a cópia existe '
  'porque o banco não importa TypeScript, e a recusa tem que acontecer aqui, onde é '
  'autoridade. Ao mexer numa, mexa na outra.';

-- ---------------------------------------------------------------------------
-- As duas funções passam a consultar a lista, em vez de carregá-la
-- ---------------------------------------------------------------------------
-- Antes cada uma tinha a própria cópia literal, o que garantia que divergiriam.

create or replace function public.set_business_slug(
  p_tenant_id uuid,
  p_slug text
)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_slug text;
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Only the owner can change the business address' using errcode = '42501';
  end if;

  v_slug := left(public.slugify(coalesce(p_slug, '')), 32);

  if char_length(v_slug) < 3 then
    raise exception 'O endereço precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;

  if public.endereco_reservado(v_slug) then
    raise exception 'Este endereço é reservado. Escolha outro.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('business_slug:' || v_slug, 0));

  if exists (
    select 1
    from public.businesses outro
    where outro.slug = v_slug and outro.id <> p_tenant_id
  ) then
    raise exception 'Este endereço já está em uso.' using errcode = '23505';
  end if;

  update public.businesses business
  set slug = v_slug
  where business.id = p_tenant_id
  returning * into v_business;

  if not found then
    raise exception 'Empresa não encontrada' using errcode = 'P0001';
  end if;

  perform public.write_audit_log(
    p_tenant_id, 'update', 'business_slug', p_tenant_id,
    jsonb_build_object('slug', v_slug)
  );

  return v_business;
end;
$$;

-- Só o trecho do endereço muda; o resto do corpo é o da 20260826000500.
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

  -- Nome reservado, curto demais ou já em uso cai no sufixo do id. Uma "Barbearia
  -- Suporte" ganha `barbearia-suporte`; uma empresa chamada só "Suporte" ganha
  -- `suporte-a1b2c3`, que é feio e funciona — melhor que recusar a abertura.
  if char_length(v_slug) < 3
     or public.endereco_reservado(v_slug)
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

-- Chamada de dentro das duas funções acima, que são SECURITY DEFINER. A interface tem a
-- própria cópia em TypeScript para avisar antes de enviar; não precisa desta.
revoke all on function public.endereco_reservado(text) from public, anon, authenticated;
