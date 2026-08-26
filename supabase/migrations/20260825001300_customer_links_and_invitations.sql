-- Etapa 4 — vínculo cliente ↔ empresa e convite por código.
--
-- É a peça mais estruturante da etapa, e a base real da área do cliente (Etapa 10).
--
-- O QUE O BARBERSHOP ENSINA
--
-- Lá o vínculo vive em `usuarios/{uid}/vinculos/{tipo_alvoId}`, com **id
-- determinístico**: a mesma origem nunca duplica o vínculo. Rastreia de onde veio —
-- QR Code, link, código digitado ou convite — e aponta para o profissional específico
-- que originou, mesmo quando o alvo é a empresa.
--
-- Aqui o determinismo vem de `unique (tenant_id, user_id)`: um usuário tem no máximo
-- um vínculo por empresa, resgatar duas vezes devolve o mesmo.
--
-- POR QUE ISTO É O NÚCLEO DA ÁREA DO CLIENTE
--
-- Hoje toda política é `is_active_business_member`, e `anon` não tem nada. O cliente
-- final não é membro da empresa — ele nunca vai ter linha em `business_members`. Sem
-- um caminho próprio, não existe área do cliente.
--
-- Esta migration cria esse caminho: o usuário vinculado enxerga o próprio vínculo.
-- A Etapa 10 estende a partir daqui, sem afrouxar nada do lado da equipe.

create type public.customer_link_origin as enum ('qr', 'link', 'code', 'invite');

-- ---------------------------------------------------------------------------
-- Convite
-- ---------------------------------------------------------------------------

create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  code text not null,
  /** Profissional cujo QR ou link originou o convite. Nulo = convite da empresa. */
  professional_id uuid,
  active boolean not null default true,
  expires_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Global: o código é resgatado sem que o cliente saiba de qual empresa é.
  unique (code),
  unique (id, tenant_id),
  constraint business_invitations_code_format check (
    code ~ '^[A-Z0-9]{6,16}$'
  ),
  constraint business_invitations_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete cascade
);

alter table public.business_invitations enable row level security;

create policy business_invitations_select_member
on public.business_invitations for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy business_invitations_manage_scheduler
on public.business_invitations for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.business_invitations from anon, authenticated;
grant select, insert, update, delete on public.business_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Vínculo
-- ---------------------------------------------------------------------------

create table public.customer_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  origin public.customer_link_origin not null,
  invited_by_professional_id uuid,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- O determinismo do Barbershop: resgatar de novo devolve o mesmo vínculo.
  unique (tenant_id, user_id),
  -- E um cadastro de cliente pertence a um usuário só.
  unique (tenant_id, customer_id),
  unique (id, tenant_id),

  constraint customer_links_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade,
  constraint customer_links_professional_belongs_to_tenant
    foreign key (invited_by_professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete set null
);

create index customer_links_user_idx on public.customer_links (user_id) where active;

create trigger customer_links_set_updated_at
before update on public.customer_links
for each row
execute function public.set_updated_at();

alter table public.customer_links enable row level security;

-- Duas portas: a equipe vê os vínculos da empresa; o cliente vê o próprio.
-- A segunda é a que não existia em lugar nenhum do schema — é o começo do caminho
-- de acesso do consumidor final.
create policy customer_links_select_member_or_self
on public.customer_links for select to authenticated
using (
  public.is_active_business_member(tenant_id)
  or user_id = (select auth.uid())
);

create policy customer_links_manage_scheduler
on public.customer_links for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.customer_links from anon, authenticated;
grant select, insert, update, delete on public.customer_links to authenticated;

-- ---------------------------------------------------------------------------
-- Resgatar o convite
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque quem resgata NÃO é membro da empresa: é o cliente final,
-- autenticado e sem nenhuma permissão sobre o tenant. Sem isto, ele não conseguiria
-- nem ler o convite para saber que existe.
--
-- Idempotente por desenho: resgatar duas vezes devolve o mesmo vínculo, em vez de
-- criar um segundo cadastro para a mesma pessoa.

create or replace function public.redeem_business_invitation(
  p_code text,
  p_display_name text default null
)
returns public.customer_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  v_invitation public.business_invitations;
  v_link public.customer_links;
  v_customer_id uuid;
  v_nome text;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'É preciso estar autenticado para resgatar um convite.'
      using errcode = '42501';
  end if;

  select *
  into v_invitation
  from public.business_invitations invitation
  where invitation.code = upper(trim(p_code))
    and invitation.active
    and (invitation.expires_at is null or invitation.expires_at > now());

  if not found then
    raise exception 'Convite inválido ou expirado.' using errcode = 'P0001';
  end if;

  -- Já vinculado: devolve o que existe. É o determinismo do Barbershop.
  select *
  into v_link
  from public.customer_links link
  where link.tenant_id = v_invitation.tenant_id
    and link.user_id = v_user_id;

  if found then
    return v_link;
  end if;

  select users.email
  into v_email
  from auth.users users
  where users.id = v_user_id;

  -- Se a empresa já cadastrou esta pessoa pelo e-mail, o vínculo aproveita o cadastro
  -- em vez de criar um duplicado — o histórico dela continua inteiro.
  select customer.id
  into v_customer_id
  from public.customers customer
  where customer.tenant_id = v_invitation.tenant_id
    and customer.email is not null
    and lower(customer.email) = lower(v_email)
    and customer.active
    and not exists (
      select 1
      from public.customer_links existing
      where existing.tenant_id = customer.tenant_id
        and existing.customer_id = customer.id
    )
  limit 1;

  if v_customer_id is null then
    v_nome := nullif(trim(coalesce(p_display_name, '')), '');

    if v_nome is null then
      select nullif(trim(profile.display_name), '')
      into v_nome
      from public.profiles profile
      where profile.id = v_user_id;
    end if;

    insert into public.customers (tenant_id, name, email, created_by)
    values (
      v_invitation.tenant_id,
      coalesce(v_nome, split_part(coalesce(v_email, 'cliente'), '@', 1)),
      v_email,
      v_user_id
    )
    returning id into v_customer_id;
  end if;

  insert into public.customer_links (
    tenant_id, customer_id, user_id, origin, invited_by_professional_id
  )
  values (
    v_invitation.tenant_id,
    v_customer_id,
    v_user_id,
    'invite',
    v_invitation.professional_id
  )
  returning * into v_link;

  return v_link;
end;
$$;

revoke all on function public.redeem_business_invitation(text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_business_invitation(text, text) to authenticated;

comment on table public.customer_links is
  'Vínculo entre um usuário autenticado e o cadastro de cliente de uma empresa. '
  'Determinístico: um vínculo por (empresa, usuário). É o caminho de acesso do '
  'consumidor final, que nunca terá linha em business_members.';
