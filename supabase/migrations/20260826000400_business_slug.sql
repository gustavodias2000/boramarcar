-- Endereço da empresa na URL: `/e/[empresa]` em vez de `/e/[uuid]`.
--
-- POR QUE AGORA, E NÃO DEPOIS
--
-- A rota `/e/[empresa]` vai ao ar nesta mesma onda. Se subir com UUID e o slug chegar
-- depois, todo link salvo morre. Decidir a forma da URL é barato hoje — seis rotas — e
-- caro depois das ~49 telas de núcleo que a ADR 0004 prevê.
--
-- POR QUE NÃO É SÓ UMA COLUNA
--
-- `businesses` não tem unicidade em `name`: duas "Barbearia do Zé" são legais hoje.
-- Colisão de slug não é hipótese, é certeza a prazo — daí o desempate por sufixo.

-- ---------------------------------------------------------------------------
-- Normalização
-- ---------------------------------------------------------------------------
-- `unaccent()` seria o óbvio e não serve: é STABLE, e STABLE não entra em coluna gerada
-- nem em índice de expressão. `translate()` com mapa explícito é IMMUTABLE e cobre o
-- português inteiro.

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(translate(
          p_text,
          'áàâãäåçéèêëíìîïñóòôõöúùûüýÿÁÀÂÃÄÅÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜÝ',
          'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
        )),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- A coluna, e o preenchimento do que já existe
-- ---------------------------------------------------------------------------

alter table public.businesses add column slug text;

-- Nome primeiro. Empresas homônimas desempatam por sufixo do id, e a mais antiga fica
-- com o endereço limpo.
update public.businesses business
set slug = candidato.valor
from (
  select
    b.id,
    case
      when row_number() over (partition by base.valor order by b.created_at, b.id) = 1
        then base.valor
      else base.valor || '-' || left(replace(b.id::text, '-', ''), 6)
    end as valor
  from public.businesses b
  cross join lateral (
    select coalesce(nullif(left(public.slugify(b.name), 32), ''), 'empresa') as valor
  ) base
) candidato
where candidato.id = business.id;

-- Rede: nomes longos truncados no mesmo ponto ainda podem colidir. O id resolve.
update public.businesses business
set slug = 'e-' || left(replace(business.id::text, '-', ''), 10)
where exists (
  select 1
  from public.businesses outro
  where outro.slug = business.slug and outro.id <> business.id
);

alter table public.businesses
  alter column slug set not null,
  alter column slug set default ('e-' || left(replace(gen_random_uuid()::text, '-', ''), 10));

-- Só o formato. A lista de palavras reservadas fica na RPC, não aqui: uma empresa
-- chamada "Admin" faria o CHECK reprovar o próprio backfill.
alter table public.businesses
  add constraint businesses_slug_format check (
    slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug !~ '--'
  );

create unique index businesses_slug_key on public.businesses (slug);

-- ---------------------------------------------------------------------------
-- Quem escreve — e isto vai além do slug
-- ---------------------------------------------------------------------------
-- Hoje `authenticated` tem UPDATE de tabela inteira em `businesses`
-- (`20260825000200_harden_privileges.sql:43`) e a política libera qualquer coluna para
-- owner e manager. Ou seja: um gerente reescreve `business_type` de um tenant vivo,
-- trocando o conjunto de features inteiro, e reescreve `created_by`.
--
-- Isso já era um problema antes do slug. Com o endereço na URL, escrita livre também
-- vira link quebrado e squatting. A partir daqui, coluna estrutural é ato explícito.

revoke update on public.businesses from authenticated;
grant update (name, timezone, active, data_retention_months)
  on public.businesses to authenticated;

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

  if v_slug in ('api', 'admin', 'app', 'auth', 'login', 'entrar', 'sair', 'cadastro',
                'novo', 'nova', 'inicio', 'conta', 'ajuda', 'suporte', 'sobre',
                'termos', 'privacidade', 'static', 'comecar', 'e') then
    raise exception 'Este endereço é reservado. Escolha outro.' using errcode = '22023';
  end if;

  -- Mesma trava da placa em `open_automotive_walk_in_work_order`: dois pedidos
  -- simultâneos do mesmo endereço serializam, em vez de os dois receberem 23505.
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

-- ---------------------------------------------------------------------------
-- Empresa nova nasce com endereço legível
-- ---------------------------------------------------------------------------
-- Sem isto, toda empresa criada pela tela cairia no default aleatório `e-<hex>`, e o
-- slug seria decorativo.

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

  insert into public.businesses (name, business_type, timezone, created_by)
  values (
    v_nome,
    p_business_type,
    coalesce(nullif(trim(p_timezone), ''), 'America/Sao_Paulo'),
    v_user_id
  )
  returning * into v_business;

  -- O endereço, derivado do nome. Colisão e palavra reservada caem no sufixo do id.
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

  -- O catálogo sugerido da categoria. Preço zerado: quem abriu precifica.
  insert into public.services (tenant_id, name, duration_minutes, base_price, created_by)
  select v_business.id, padrao.name, padrao.duration_minutes, 0, v_user_id
  from public.segment_default_services padrao
  where padrao.business_type = p_business_type
  order by padrao.display_order;

  -- O dono como primeiro profissional. Sem isto a agenda nasce inutilizável.
  select nullif(trim(profile.display_name), '')
  into v_profissional_nome
  from public.profiles profile
  where profile.id = v_user_id;

  insert into public.professionals (tenant_id, business_member_id, name, created_by)
  values (
    v_business.id,
    v_member_id,
    coalesce(v_profissional_nome, v_nome),
    v_user_id
  )
  returning id into v_professional_id;

  -- Segunda a sábado, 9h às 18h. O gatilho de sincronia já criou o recurso de agenda.
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
-- Privilégios
-- ---------------------------------------------------------------------------
-- `slugify` fica fechada: só é chamada de dentro de funções SECURITY DEFINER, que rodam
-- como o dono. Conceder EXECUTE não quebraria nada, mas ampliaria a superfície sem
-- motivo — e a lista fechada do snapshot existe para isso doer.

revoke all on function public.slugify(text) from public, anon, authenticated;

revoke all on function public.set_business_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.set_business_slug(uuid, text) to authenticated;

comment on column public.businesses.slug is
  'Endereço da empresa na URL (`/e/[slug]`). Único globalmente. Escrito só por '
  '`set_business_slug` — o UPDATE direto foi revogado junto com `business_type`.';
