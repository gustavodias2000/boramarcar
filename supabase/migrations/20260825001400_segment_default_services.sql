-- Etapa 5 — catálogo sugerido por categoria e criação de empresa.
--
-- O §9 do Contexto Mestre promete que, escolhido o segmento, o sistema adapta
-- "serviços sugeridos" e "configurações iniciais". O §23 lista os 19 serviços
-- automotivos. Nada disso existia: `supabase/seed.sql` estava vazio e não havia
-- nenhuma forma de criar uma empresa pela aplicação.
--
-- Este é o teste da arquitetura multi-categoria. Se o núcleo estiver certo, abrir uma
-- barbearia é escolher um valor de enum e receber o catálogo pronto.
--
-- OS PREÇOS NASCEM ZERADOS de propósito. Preço varia por cidade, por bairro e por
-- posicionamento; sugerir um número seria inventar. Duração é diferente: uma escova
-- leva 45 minutos em qualquer lugar, e é dela que a agenda depende.

create table public.segment_default_services (
  id uuid primary key default gen_random_uuid(),
  business_type public.business_type not null,
  name text not null,
  duration_minutes integer not null,
  display_order integer not null default 0,

  unique (business_type, name),
  constraint segment_default_services_name_length check (
    char_length(trim(name)) between 1 and 160
  ),
  constraint segment_default_services_duration_positive check (duration_minutes > 0)
);

-- Catálogo de referência, não dado de tenant: qualquer usuário autenticado pode ler,
-- inclusive antes de ter empresa — é o que a tela de abertura mostra como prévia.
alter table public.segment_default_services enable row level security;

create policy segment_default_services_select_authenticated
on public.segment_default_services for select to authenticated
using (true);

revoke all on public.segment_default_services from anon, authenticated;
grant select on public.segment_default_services to authenticated;

insert into public.segment_default_services (business_type, name, duration_minutes, display_order)
values
  -- Barbearia — a categoria de referência, vinda da experiência do Barbershop
  ('barbershop', 'Corte de cabelo', 30, 1),
  ('barbershop', 'Corte e barba', 60, 2),
  ('barbershop', 'Barba', 30, 3),
  ('barbershop', 'Barba terapêutica', 45, 4),
  ('barbershop', 'Pezinho', 15, 5),
  ('barbershop', 'Sobrancelha', 15, 6),
  ('barbershop', 'Corte infantil', 30, 7),
  ('barbershop', 'Hidratação capilar', 30, 8),
  ('barbershop', 'Platinado', 120, 9),
  ('barbershop', 'Luzes', 90, 10),

  -- Manicure
  ('manicure', 'Manicure', 45, 1),
  ('manicure', 'Pedicure', 60, 2),
  ('manicure', 'Manicure e pedicure', 90, 3),
  ('manicure', 'Esmaltação em gel', 75, 4),
  ('manicure', 'Alongamento em fibra', 120, 5),
  ('manicure', 'Manutenção de alongamento', 90, 6),
  ('manicure', 'Blindagem', 60, 7),
  ('manicure', 'Spa dos pés', 60, 8),

  -- Salão de beleza
  ('beauty_salon', 'Corte feminino', 60, 1),
  ('beauty_salon', 'Escova', 45, 2),
  ('beauty_salon', 'Escova e prancha', 60, 3),
  ('beauty_salon', 'Hidratação', 45, 4),
  ('beauty_salon', 'Coloração', 120, 5),
  ('beauty_salon', 'Mechas', 180, 6),
  ('beauty_salon', 'Progressiva', 180, 7),
  ('beauty_salon', 'Penteado', 90, 8),

  -- Maquiagem
  ('makeup', 'Maquiagem social', 60, 1),
  ('makeup', 'Maquiagem para madrinha', 90, 2),
  ('makeup', 'Maquiagem para noiva', 120, 3),
  ('makeup', 'Maquiagem artística', 90, 4),
  ('makeup', 'Aula de automaquiagem', 120, 5),

  -- Massoterapia
  ('massage', 'Massagem relaxante', 60, 1),
  ('massage', 'Massagem modeladora', 60, 2),
  ('massage', 'Drenagem linfática', 60, 3),
  ('massage', 'Pedras quentes', 75, 4),
  ('massage', 'Shiatsu', 60, 5),
  ('massage', 'Massagem desportiva', 60, 6),

  -- Tatuagem
  ('tattoo', 'Orçamento e desenho', 60, 1),
  ('tattoo', 'Sessão de tatuagem', 180, 2),
  ('tattoo', 'Retoque', 60, 3),
  ('tattoo', 'Cobertura', 240, 4),

  -- Sobrancelhas
  ('eyebrows', 'Design de sobrancelhas', 30, 1),
  ('eyebrows', 'Design com henna', 45, 2),
  ('eyebrows', 'Micropigmentação', 120, 3),
  ('eyebrows', 'Laminação', 60, 4),

  -- Estética facial e corporal
  ('aesthetics', 'Limpeza de pele', 60, 1),
  ('aesthetics', 'Peeling', 60, 2),
  ('aesthetics', 'Massagem modeladora', 60, 3),
  ('aesthetics', 'Drenagem linfática', 60, 4),
  ('aesthetics', 'Radiofrequência', 45, 5),

  -- Depilação
  ('depilation', 'Depilação de axilas', 15, 1),
  ('depilation', 'Depilação de pernas', 45, 2),
  ('depilation', 'Depilação de virilha', 30, 3),
  ('depilation', 'Depilação facial', 20, 4),
  ('depilation', 'Depilação a laser', 45, 5),

  -- Pet shop
  ('petshop', 'Banho', 60, 1),
  ('petshop', 'Banho e tosa', 120, 2),
  ('petshop', 'Tosa higiênica', 45, 3),
  ('petshop', 'Corte de unhas', 15, 4),
  ('petshop', 'Hidratação', 60, 5),

  -- Estética automotiva — os 19 do §23 do Contexto Mestre
  ('automotive_aesthetics', 'Lavagem simples', 45, 1),
  ('automotive_aesthetics', 'Lavagem completa', 90, 2),
  ('automotive_aesthetics', 'Lavagem detalhada', 180, 3),
  ('automotive_aesthetics', 'Lavagem técnica', 240, 4),
  ('automotive_aesthetics', 'Lavagem de motor', 60, 5),
  ('automotive_aesthetics', 'Higienização interna', 180, 6),
  ('automotive_aesthetics', 'Higienização de bancos', 120, 7),
  ('automotive_aesthetics', 'Limpeza de teto', 60, 8),
  ('automotive_aesthetics', 'Polimento comercial', 180, 9),
  ('automotive_aesthetics', 'Polimento técnico', 480, 10),
  ('automotive_aesthetics', 'Vitrificação', 480, 11),
  ('automotive_aesthetics', 'Cristalização', 240, 12),
  ('automotive_aesthetics', 'Descontaminação de pintura', 120, 13),
  ('automotive_aesthetics', 'Revitalização de plásticos', 90, 14),
  ('automotive_aesthetics', 'Hidratação de couro', 90, 15),
  ('automotive_aesthetics', 'Limpeza de rodas', 45, 16),
  ('automotive_aesthetics', 'Limpeza de caixa de roda', 45, 17),
  ('automotive_aesthetics', 'Tratamento de vidros', 60, 18),
  ('automotive_aesthetics', 'Impermeabilização', 120, 19);

-- ---------------------------------------------------------------------------
-- Abrir uma empresa
-- ---------------------------------------------------------------------------
-- As políticas já permitiam este fluxo desde a primeira migration:
-- `businesses_insert_creator_only` e `can_claim_initial_tenant_owner`. Faltava um
-- caminho que fizesse as três coisas — empresa, posse e catálogo — numa transação só.
--
-- Sem isto, criar a primeira empresa exigia rodar SQL à mão, o que o README documentava
-- como bloqueador absoluto para qualquer dev novo. É também o que sustenta o "modo
-- prévia" da interface: com abertura de empresa, o andaime pode cair.

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
  v_nome text;
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
  values (v_nome, p_business_type, coalesce(nullif(trim(p_timezone), ''), 'America/Sao_Paulo'), v_user_id)
  returning * into v_business;

  insert into public.business_members (tenant_id, user_id, role, added_by)
  values (v_business.id, v_user_id, 'owner', v_user_id);

  -- O catálogo sugerido da categoria. Preço zerado: quem abriu precifica.
  insert into public.services (tenant_id, name, duration_minutes, base_price, created_by)
  select
    v_business.id,
    padrao.name,
    padrao.duration_minutes,
    0,
    v_user_id
  from public.segment_default_services padrao
  where padrao.business_type = p_business_type
  order by padrao.display_order;

  return v_business;
end;
$$;

revoke all on function public.create_business_with_owner(text, public.business_type, text)
  from public, anon, authenticated;
grant execute on function public.create_business_with_owner(text, public.business_type, text)
  to authenticated;

comment on table public.segment_default_services is
  'Catálogo sugerido por categoria, aplicado na abertura da empresa. Duração é '
  'universal e a agenda depende dela; preço nasce zerado porque varia por praça.';
