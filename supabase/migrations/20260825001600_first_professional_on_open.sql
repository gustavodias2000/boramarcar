-- Etapa 7 — a empresa nasce podendo agendar.
--
-- O QUE A ETAPA 5 DEIXOU PASSAR
--
-- `create_business_with_owner` criava a empresa, a posse e o catálogo de serviços. Mas
-- agendar exige um PROFISSIONAL e uma disponibilidade recorrente, e nenhum dos dois
-- era criado. O resultado: quem abria uma manicure recebia oito serviços e não
-- conseguia marcar nada — a agenda recusava com "profissional ativo não encontrado".
--
-- Só apareceu ao escrever o teste que abre as três categorias novas e tenta usar cada
-- uma de ponta a ponta. É exatamente o que a Etapa 7 existe para revelar.
--
-- A DECISÃO
--
-- Quem abre um estúdio de unhas quase sempre é a manicure. Quem abre uma barbearia
-- costuma cortar cabelo. O dono vira o primeiro profissional, com disponibilidade de
-- segunda a sábado das 9h às 18h.
--
-- É um palpite, e assumido como tal: desativar o profissional ou mudar o horário são
-- duas ações. Começar podendo trabalhar é melhor que começar tendo que adivinhar o
-- que falta.

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

revoke all on function public.create_business_with_owner(text, public.business_type, text)
  from public, anon, authenticated;
grant execute on function public.create_business_with_owner(text, public.business_type, text)
  to authenticated;

comment on function public.create_business_with_owner(text, public.business_type, text) is
  'Abre a empresa com posse, catálogo da categoria, o dono como primeiro profissional e '
  'disponibilidade padrão. O objetivo é poder agendar no primeiro minuto.';
