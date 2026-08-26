-- LGPD (§48 do Contexto Mestre) — e os achados C-8, C-11 e C-12.
--
-- O Contexto Mestre trata LGPD como requisito de arquitetura, não funcionalidade
-- opcional. O schema não tinha nada: sem consentimento, sem retenção, sem
-- anonimização, e com todo dado pessoal legível por qualquer membro da empresa.
--
-- O Barbershop já resolvia tudo isto. Esta migration traduz, e de quebra fecha três
-- achados da auditoria:
--
--   C-8   um técnico lê CPF, telefone, e-mail e aniversário de TODOS os clientes;
--   C-11  a política promete DELETE de profissional que o schema torna impossível;
--   C-12  FKs RESTRICT impedem excluir empresa com histórico — o direito ao
--         esquecimento fica tecnicamente inalcançável.

-- ---------------------------------------------------------------------------
-- C-8 — o dado pessoal sai da mesa de todo mundo
-- ---------------------------------------------------------------------------
-- Privilégio de coluna não resolve: todo usuário da aplicação é `authenticated`, e
-- GRANT não distingue papel de tenant. A saída é a mesma do Barbershop — o dado
-- sensível vai para uma tabela própria, com política própria.
--
-- O NOME fica em `customers`: a OS precisa mostrar de quem é o carro, e o técnico
-- precisa disso para trabalhar. O que sai é o que ele não precisa: documento,
-- telefone, e-mail, aniversário e as anotações livres — que são o campo mais provável
-- de conter dado sensível de verdade ("alérgico a", "reclamou de").

create table public.customer_contacts (
  customer_id uuid primary key,
  tenant_id uuid not null references public.businesses (id) on delete cascade,

  cpf_cnpj text,
  phone text,
  whatsapp text,
  email text,

  /**
   * "MM-DD", sem ano. Minimização vinda do Barbershop: permite a campanha de
   * aniversariantes sem guardar a idade de ninguém.
   */
  birthday_md text,

  notes text,

  updated_at timestamptz not null default now(),

  unique (customer_id, tenant_id),
  constraint customer_contacts_birthday_format check (
    birthday_md is null or birthday_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  ),
  constraint customer_contacts_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade
);

create trigger customer_contacts_set_updated_at
before update on public.customer_contacts
for each row
execute function public.set_updated_at();

-- Migra o que já existe, convertendo a data de nascimento para mês-dia.
insert into public.customer_contacts (
  customer_id, tenant_id, cpf_cnpj, phone, whatsapp, email, birthday_md, notes
)
select
  customer.id,
  customer.tenant_id,
  customer.cpf_cnpj,
  customer.phone,
  customer.whatsapp,
  customer.email,
  to_char(customer.birthday, 'MM-DD'),
  customer.notes
from public.customers customer
on conflict (customer_id) do nothing;

alter table public.customers
  drop column cpf_cnpj,
  drop column phone,
  drop column whatsapp,
  drop column email,
  drop column birthday,
  drop column notes;

-- Marca de anonimização, usada mais abaixo.
alter table public.customers
  add column anonymized_at timestamptz;

alter table public.customer_contacts enable row level security;

-- Quem contata o cliente: proprietário, gerência e recepção. O técnico e o caixa
-- ficam de fora — nenhum dos dois precisa do documento de ninguém para trabalhar.
create policy customer_contacts_manage_scheduler
on public.customer_contacts for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.customer_contacts from anon, authenticated;
grant select, insert, update, delete on public.customer_contacts to authenticated;

-- ---------------------------------------------------------------------------
-- Consentimento por finalidade
-- ---------------------------------------------------------------------------
-- O princípio vem literal do Barbershop: *"ausente significa opt-in pendente, nunca
-- autorização implícita"*. Por isso não há valor padrão `true` em lugar nenhum, e a
-- ausência de linha significa "não consentido".
--
-- Separado por finalidade porque consentir em receber a confirmação do agendamento
-- não é consentir em receber promoção.

create type public.consent_purpose as enum (
  'service_terms',
  'marketing_push',
  'marketing_whatsapp',
  'marketing_email'
);

create table public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  purpose public.consent_purpose not null,

  granted boolean not null,
  granted_at timestamptz not null default now(),
  /** Quem registrou. Nulo quando o próprio cliente consentiu pela área do cliente. */
  recorded_by uuid references auth.users (id) on delete set null,
  source text,

  unique (tenant_id, customer_id, purpose),
  constraint customer_consents_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade
);

alter table public.customer_consents enable row level security;

create policy customer_consents_manage_scheduler
on public.customer_consents for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.customer_consents from anon, authenticated;
grant select, insert, update, delete on public.customer_consents to authenticated;

-- ---------------------------------------------------------------------------
-- Trilha de auditoria
-- ---------------------------------------------------------------------------
-- Os eventos existentes cobrem OS e agendamento. Não cobrem alteração de cliente,
-- preço, papel de membro nem anonimização — justamente o que a LGPD pede que se saiba
-- quem fez e quando.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint audit_log_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_log_tenant_time_idx on public.audit_log (tenant_id, occurred_at desc);

alter table public.audit_log enable row level security;

-- Só administração lê a trilha, e ninguém escreve por fora: as funções que registram
-- são SECURITY DEFINER. Trilha que o auditado pode apagar não é trilha.
create policy audit_log_select_administrator
on public.audit_log for select to authenticated
using (public.is_tenant_administrator(tenant_id));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.write_audit_log(
  p_tenant_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (tenant_id, actor_user_id, action, entity, entity_id, metadata)
  values (p_tenant_id, (select auth.uid()), p_action, p_entity, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C-12 — anonimizar, não apagar
-- ---------------------------------------------------------------------------
-- As FKs RESTRICT impedem apagar um cliente com histórico, e a retenção contábil
-- impede apagar de qualquer forma. Apagar o cliente levaria junto o registro fiscal
-- do que foi vendido.
--
-- A resposta correta em LGPD é anonimizar: o dado pessoal some, o fato comercial
-- permanece. Resolve o direito ao esquecimento SEM afrouxar integridade referencial.

create or replace function public.anonymize_customer(
  p_customer_id uuid,
  p_reason text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  select *
  into v_customer
  from public.customers customer
  where customer.id = p_customer_id
  for update;

  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_administrator(v_customer.tenant_id) then
    raise exception 'Only an administrator can anonymize a customer' using errcode = '42501';
  end if;

  if v_customer.anonymized_at is not null then
    return v_customer;
  end if;

  -- O dado pessoal some por completo.
  delete from public.customer_contacts contact where contact.customer_id = v_customer.id;
  delete from public.customer_consents consent where consent.customer_id = v_customer.id;

  -- O vínculo com a conta do cliente também: ele deixa de ser identificável.
  delete from public.customer_links link where link.customer_id = v_customer.id;

  update public.customers customer
  set name = 'Cliente anonimizado ' || left(replace(customer.id::text, '-', ''), 6),
      active = false,
      anonymized_at = now()
  where customer.id = v_customer.id
  returning * into v_customer;

  perform public.write_audit_log(
    v_customer.tenant_id,
    'anonymize',
    'customer',
    v_customer.id,
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );

  return v_customer;
end;
$$;


-- ---------------------------------------------------------------------------
-- C-11 — desligar profissional
-- ---------------------------------------------------------------------------
-- A política concedia DELETE, mas o gatilho cria um `scheduling_resources` com FK
-- RESTRICT: todo DELETE falhava com 23503. A política prometia o que o schema impedia.
--
-- Apagar seria errado de qualquer forma — o histórico de quem atendeu quem é registro
-- fiscal e operacional. O que existe é desligamento.

drop policy if exists professionals_manage_administrator on public.professionals;

-- A leitura já tem política própria (`professionals_select_member`, de qualquer membro
-- ativo) e não muda: o que sai é só o DELETE que a FOR ALL prometia.
create policy professionals_insert_administrator
on public.professionals for insert to authenticated
with check (public.is_tenant_administrator(tenant_id));

create policy professionals_update_administrator
on public.professionals for update to authenticated
using (public.is_tenant_administrator(tenant_id))
with check (public.is_tenant_administrator(tenant_id));

-- Sem política de DELETE: a operação não é possível e agora também não é prometida.
revoke delete on public.professionals from authenticated;

create or replace function public.deactivate_professional(p_professional_id uuid)
returns public.professionals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional public.professionals;
  v_futuros integer;
begin
  select *
  into v_professional
  from public.professionals professional
  where professional.id = p_professional_id
  for update;

  if not found then
    raise exception 'Profissional não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_administrator(v_professional.tenant_id) then
    raise exception 'Only an administrator can deactivate a professional' using errcode = '42501';
  end if;

  -- Desligar alguém com agenda marcada deixaria clientes esperando por quem não vem.
  select count(*)
  into v_futuros
  from public.appointments appointment
  where appointment.professional_id = v_professional.id
    and appointment.status in ('scheduled', 'confirmed', 'in_progress')
    and appointment.start_at > now();

  if v_futuros > 0 then
    raise exception
      'Este profissional tem % atendimento(s) futuro(s). Remarque ou cancele antes de desligar.',
      v_futuros
      using errcode = '22023';
  end if;

  update public.professionals professional
  set active = false
  where professional.id = v_professional.id
  returning * into v_professional;

  -- O recurso de agenda acompanha sozinho: `professionals_sync_scheduling_resource`
  -- propaga `active` no UPDATE acima. Não repetimos a escrita aqui — mas o teste
  -- afirma o resultado, para que remover aquele gatilho não passe despercebido.

  perform public.write_audit_log(
    v_professional.tenant_id, 'deactivate', 'professional', v_professional.id, '{}'::jsonb
  );

  return v_professional;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retenção
-- ---------------------------------------------------------------------------
-- Guardar o prazo é o que torna a política auditável. A varredura que apaga o que
-- venceu precisa de execução agendada, que chega com as notificações.

alter table public.businesses
  add column data_retention_months integer;

alter table public.businesses
  add constraint businesses_retention_range check (
    data_retention_months is null or data_retention_months between 6 and 240
  );

comment on column public.businesses.data_retention_months is
  'Prazo de retenção declarado pela empresa, em meses. Nulo = não definido. A varredura '
  'que executa a política depende de execução agendada (§41).';

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke all on function public.anonymize_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.anonymize_customer(uuid, text) to authenticated;

revoke all on function public.deactivate_professional(uuid) from public, anon, authenticated;
grant execute on function public.deactivate_professional(uuid) to authenticated;

comment on table public.customer_contacts is
  'Dado pessoal do cliente, separado do cadastro operacional. O nome fica em `customers` '
  'porque a operação precisa dele; documento, telefone, e-mail, aniversário e anotações '
  'ficam aqui, visíveis só a quem contata o cliente. Corrige o achado C-8.';

-- ---------------------------------------------------------------------------
-- As duas funções que escreviam dado pessoal em `customers`
-- ---------------------------------------------------------------------------
-- `DROP COLUMN` não valida corpo de função: elas continuariam existindo e quebrariam
-- só na primeira chamada em produção. Por isso são redefinidas aqui, na mesma
-- migration que move as colunas.

create or replace function public.upsert_customer_contact(
  p_customer_id uuid,
  p_phone text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_cpf_cnpj text default null,
  p_birthday_md text default null,
  p_notes text default null
)
returns public.customer_contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_contact public.customer_contacts;
begin
  select *
  into v_customer
  from public.customers customer
  where customer.id = p_customer_id;

  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_customer.tenant_id) then
    raise exception 'Only a scheduler can write customer contact data'
      using errcode = '42501';
  end if;

  if v_customer.anonymized_at is not null then
    raise exception 'Este cliente foi anonimizado e não aceita novo dado pessoal.'
      using errcode = '22023';
  end if;

  insert into public.customer_contacts as contact (
    customer_id, tenant_id, phone, whatsapp, email, cpf_cnpj, birthday_md, notes
  )
  values (
    v_customer.id,
    v_customer.tenant_id,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    lower(nullif(trim(coalesce(p_email, '')), '')),
    nullif(trim(coalesce(p_cpf_cnpj, '')), ''),
    nullif(trim(coalesce(p_birthday_md, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  on conflict (customer_id) do update
  set phone       = coalesce(excluded.phone, contact.phone),
      whatsapp    = coalesce(excluded.whatsapp, contact.whatsapp),
      email       = coalesce(excluded.email, contact.email),
      cpf_cnpj    = coalesce(excluded.cpf_cnpj, contact.cpf_cnpj),
      birthday_md = coalesce(excluded.birthday_md, contact.birthday_md),
      notes       = coalesce(excluded.notes, contact.notes)
  returning * into v_contact;

  return v_contact;
end;
$$;

revoke all on function public.upsert_customer_contact(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_customer_contact(uuid, text, text, text, text, text, text)
  to authenticated;

-- Entrada rápida: o telefone informado no balcão agora nasce já segregado.
create or replace function public.open_automotive_walk_in_work_order(
  p_tenant_id uuid,
  p_license_plate text,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_make text default null,
  p_model text default null,
  p_color text default null,
  p_year_model integer default null,
  p_odometer integer default null,
  p_fuel_level smallint default null,
  p_condition_notes text default null,
  p_notes text default null
)
returns public.automotive_work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_plate text := upper(regexp_replace(coalesce(p_license_plate, ''), '[^A-Za-z0-9]', '', 'g'));
  v_customer public.customers;
  v_vehicle public.automotive_vehicles;
  v_work_order public.automotive_work_orders;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can open an Automotive walk-in work order' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if char_length(v_normalized_plate) not between 6 and 8 then
    raise exception 'Vehicle plate must contain between 6 and 8 letters or numbers' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_normalized_plate, 0));

  select *
  into v_vehicle
  from public.automotive_vehicles vehicle
  where vehicle.tenant_id = p_tenant_id
    and vehicle.normalized_license_plate = v_normalized_plate
  for key share;

  if found then
    if not v_vehicle.active then
      raise exception 'Vehicle found for this plate is inactive' using errcode = 'P0001';
    end if;

    select *
    into v_customer
    from public.customers customer
    where customer.id = v_vehicle.customer_id
      and customer.tenant_id = p_tenant_id
    for key share;

    if not found or not v_customer.active then
      raise exception 'Active customer not found for this vehicle' using errcode = 'P0001';
    end if;

    -- Veículo conhecido, telefone novo: aproveita a informação em vez de descartá-la.
    if nullif(trim(coalesce(p_customer_phone, '')), '') is not null then
      perform public.upsert_customer_contact(
        v_customer.id, null, trim(p_customer_phone), null, null, null, null
      );
    end if;
  else
    if nullif(trim(coalesce(p_customer_name, '')), '') is null then
      raise exception 'Customer name is required for a new vehicle' using errcode = '22023';
    end if;

    insert into public.customers (
      tenant_id,
      name,
      created_by
    )
    values (
      p_tenant_id,
      trim(p_customer_name),
      (select auth.uid())
    )
    returning * into v_customer;

    if nullif(trim(coalesce(p_customer_phone, '')), '') is not null then
      insert into public.customer_contacts (customer_id, tenant_id, whatsapp)
      values (v_customer.id, p_tenant_id, trim(p_customer_phone));
    end if;

    insert into public.automotive_vehicles (
      tenant_id,
      customer_id,
      license_plate,
      make,
      model,
      color,
      year_model,
      created_by
    )
    values (
      p_tenant_id,
      v_customer.id,
      upper(trim(p_license_plate)),
      nullif(trim(p_make), ''),
      nullif(trim(p_model), ''),
      nullif(trim(p_color), ''),
      p_year_model,
      (select auth.uid())
    )
    returning * into v_vehicle;
  end if;

  select *
  into v_work_order
  from public.open_automotive_work_order(
    p_tenant_id,
    v_customer.id,
    v_vehicle.id,
    null,
    null,
    now(),
    p_odometer,
    p_fuel_level,
    p_condition_notes,
    null,
    '{}'::jsonb,
    p_notes
  );

  return v_work_order;
end;
$$;

-- Resgate de convite: o e-mail que casa o cadastro existente agora vem de
-- `customer_contacts`. A função já era SECURITY DEFINER, então continua enxergando.
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
  join public.customer_contacts contact on contact.customer_id = customer.id
  where customer.tenant_id = v_invitation.tenant_id
    and v_email is not null
    and contact.email is not null
    and lower(contact.email) = lower(v_email)
    and customer.active
    and customer.anonymized_at is null
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

    insert into public.customers (tenant_id, name, created_by)
    values (
      v_invitation.tenant_id,
      coalesce(v_nome, split_part(coalesce(v_email, 'cliente'), '@', 1)),
      v_user_id
    )
    returning id into v_customer_id;

    -- O e-mail do cliente é dado pessoal como qualquer outro: vai para a tabela
    -- segregada, não para o cadastro que o técnico enxerga.
    if v_email is not null then
      insert into public.customer_contacts (customer_id, tenant_id, email)
      values (v_customer_id, v_invitation.tenant_id, lower(v_email));
    end if;
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

-- ---------------------------------------------------------------------------
-- C-12, a metade do offboarding — excluir a empresa
-- ---------------------------------------------------------------------------
-- Trocar as três FKs acima não bastava. Há ~25 FKs RESTRICT internas ao tenant, e a
-- maioria delas é desejável: `appointments.customer_id` com RESTRICT é o que impede
-- apagar um cliente com histórico — a proteção que torna `anonymize_customer` a
-- resposta certa em vez de um paliativo.
--
-- O problema real é outro: no CASCADE de `businesses` o Postgres não garante ordem, e
-- qualquer RESTRICT interno pode ser checado antes do filho ter sumido. Então a
-- exclusão da empresa deixa de depender de sorte de ordenação e passa a ser explícita:
-- esta função apaga das folhas para a raiz, numa transação, e só então a empresa.
--
-- Se uma tabela nova for esquecida nesta lista, o teste de offboarding falha. É de
-- propósito: a lista tem que doer para não apodrecer em silêncio.

create or replace function public.delete_business(
  p_tenant_id uuid,
  p_confirmation_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  select *
  into v_business
  from public.businesses business
  where business.id = p_tenant_id
  for update;

  if not found then
    raise exception 'Empresa não encontrada' using errcode = 'P0001';
  end if;

  -- Só o proprietário. Nem gerente, nem quem criou: quem responde pela empresa.
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Only the owner can delete the business' using errcode = '42501';
  end if;

  -- Digitar o nome é a única barreira entre um clique e a perda de todo o histórico.
  if lower(trim(coalesce(p_confirmation_name, ''))) <> lower(trim(v_business.name)) then
    raise exception 'Confirme digitando o nome exato da empresa.' using errcode = '22023';
  end if;

  -- Folhas.
  delete from public.appointment_events where tenant_id = p_tenant_id;
  delete from public.appointment_ratings where tenant_id = p_tenant_id;
  delete from public.appointment_waitlist where tenant_id = p_tenant_id;
  delete from public.appointment_recurrences where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_events where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_intakes where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_items where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_media where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_payments where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_deliveries where tenant_id = p_tenant_id;
  delete from public.automotive_loyalty_entries where tenant_id = p_tenant_id;
  delete from public.automotive_loyalty_programs where tenant_id = p_tenant_id;
  delete from public.automotive_work_order_number_counters where tenant_id = p_tenant_id;
  delete from public.finance_entries where tenant_id = p_tenant_id;
  delete from public.cash_sessions where tenant_id = p_tenant_id;
  delete from public.customer_consents where tenant_id = p_tenant_id;
  delete from public.customer_contacts where tenant_id = p_tenant_id;
  delete from public.customer_links where tenant_id = p_tenant_id;
  delete from public.business_invitations where tenant_id = p_tenant_id;
  delete from public.scheduling_block_notes where tenant_id = p_tenant_id;
  delete from public.professional_schedule_rules where tenant_id = p_tenant_id;
  delete from public.professional_schedule_settings where tenant_id = p_tenant_id;
  delete from public.audit_log where tenant_id = p_tenant_id;

  -- A OS aponta para agendamento, cliente, veículo, box e reserva: sai antes deles.
  delete from public.automotive_work_orders where tenant_id = p_tenant_id;
  delete from public.appointments where tenant_id = p_tenant_id;

  delete from public.scheduling_resource_reservations where tenant_id = p_tenant_id;
  delete from public.automotive_boxes where tenant_id = p_tenant_id;
  delete from public.automotive_vehicles where tenant_id = p_tenant_id;

  delete from public.scheduling_resources where tenant_id = p_tenant_id;
  delete from public.services where tenant_id = p_tenant_id;
  delete from public.customers where tenant_id = p_tenant_id;

  -- O profissional aponta para o vínculo de membro.
  delete from public.professionals where tenant_id = p_tenant_id;
  delete from public.business_members where tenant_id = p_tenant_id;

  delete from public.businesses where id = p_tenant_id;
end;
$$;

revoke all on function public.delete_business(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_business(uuid, text) to authenticated;

comment on function public.delete_business(uuid, text) is
  'Offboarding completo, das folhas para a raiz. Existe porque o CASCADE de `businesses` '
  'não garante ordem e colide com as FKs RESTRICT internas ao tenant (achado C-12). '
  'Manter a lista de tabelas em dia — o teste de offboarding falha se faltar alguma.';

-- Com o offboarding ordenado disponível, o DELETE solto em `businesses` só serve para
-- reencontrar a colisão que o C-12 descreve. A política sai junto com o privilégio:
-- encerrar empresa passa a ter um caminho só, e ele confere o nome antes de apagar.
drop policy if exists businesses_delete_owner on public.businesses;
revoke delete on public.businesses from authenticated;
