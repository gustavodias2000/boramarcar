-- Fecha a escrita direta em dado pessoal, e retira o DELETE que o schema impede.
--
-- Dois defeitos que a própria migration de LGPD (`20260825001800`) deixou abertos ao
-- lado das soluções que ela entregou.

-- ---------------------------------------------------------------------------
-- A anonimização era contornável
-- ---------------------------------------------------------------------------
-- `upsert_customer_contact` (`20260825001800_lgpd.sql:422-425`) recusa gravar dado
-- pessoal de cliente anonimizado:
--
--   if v_customer.anonymized_at is not null then
--     raise exception 'Este cliente foi anonimizado e não aceita novo dado pessoal.'
--
-- Mas a mesma migration (`:93-99`) deixou a tabela com política `FOR ALL` e
-- `grant insert, update, delete`. Um recepcionista reidentificava o cliente com um
-- `insert` direto do navegador, passando ao largo da RPC e da guarda.
--
-- O mesmo em `customer_consents` (`:139-145`), e ali é pior: `recorded_by` nulo
-- significa, na semântica declarada pela própria tabela, "o próprio cliente
-- consentiu pela área do cliente". Escrita direta permitia forjar consentimento
-- sem deixar rastro.
--
-- A partir daqui: leitura por política, escrita só por RPC — que é onde as guardas
-- moram e onde a trilha é gravada.

drop policy if exists customer_contacts_manage_scheduler on public.customer_contacts;

create policy customer_contacts_select_scheduler
on public.customer_contacts for select to authenticated
using (public.is_tenant_scheduler(tenant_id));

revoke insert, update, delete on public.customer_contacts from authenticated;

drop policy if exists customer_consents_manage_scheduler on public.customer_consents;

create policy customer_consents_select_scheduler
on public.customer_consents for select to authenticated
using (public.is_tenant_scheduler(tenant_id));

revoke insert, update, delete on public.customer_consents from authenticated;

-- ---------------------------------------------------------------------------
-- Apagar um campo, que o upsert não sabe fazer
-- ---------------------------------------------------------------------------
-- `upsert_customer_contact` usa `coalesce(excluded.x, contact.x)`: passar nulo nunca
-- apaga, só deixa como estava. Apagar é um direito do titular, e o único caminho que
-- existia era o UPDATE direto que acabou de ser revogado. Sem esta função, o revoke
-- acima tiraria um direito em vez de proteger um.

create or replace function public.clear_customer_contact_fields(
  p_customer_id uuid,
  p_fields text[]
)
returns public.customer_contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_contact public.customer_contacts;
  v_invalido text;
begin
  select *
  into v_customer
  from public.customers customer
  where customer.id = p_customer_id;

  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_customer.tenant_id) then
    raise exception 'Only a scheduler can erase customer contact data' using errcode = '42501';
  end if;

  if coalesce(array_length(p_fields, 1), 0) = 0 then
    raise exception 'Informe ao menos um campo para apagar.' using errcode = '22023';
  end if;

  select campo
  into v_invalido
  from unnest(p_fields) as campo
  where campo not in ('cpf_cnpj', 'phone', 'whatsapp', 'email', 'birthday_md', 'notes')
  limit 1;

  if v_invalido is not null then
    raise exception 'Campo desconhecido: %', v_invalido using errcode = '22023';
  end if;

  update public.customer_contacts contact
  set cpf_cnpj    = case when 'cpf_cnpj'    = any(p_fields) then null else contact.cpf_cnpj end,
      phone       = case when 'phone'       = any(p_fields) then null else contact.phone end,
      whatsapp    = case when 'whatsapp'    = any(p_fields) then null else contact.whatsapp end,
      email       = case when 'email'       = any(p_fields) then null else contact.email end,
      birthday_md = case when 'birthday_md' = any(p_fields) then null else contact.birthday_md end,
      notes       = case when 'notes'       = any(p_fields) then null else contact.notes end
  where contact.customer_id = v_customer.id
  returning * into v_contact;

  if not found then
    raise exception 'Este cliente não tem dado de contato registrado' using errcode = 'P0001';
  end if;

  perform public.write_audit_log(
    v_customer.tenant_id,
    'erase',
    'customer_contact',
    v_customer.id,
    jsonb_build_object('fields', to_jsonb(p_fields))
  );

  return v_contact;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consentimento com autoria verdadeira
-- ---------------------------------------------------------------------------

create or replace function public.record_customer_consent(
  p_customer_id uuid,
  p_purpose public.consent_purpose,
  p_granted boolean,
  p_source text default null
)
returns public.customer_consents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_consent public.customer_consents;
begin
  select *
  into v_customer
  from public.customers customer
  where customer.id = p_customer_id;

  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_customer.tenant_id) then
    raise exception 'Only a scheduler can record customer consent' using errcode = '42501';
  end if;

  if v_customer.anonymized_at is not null then
    raise exception 'Este cliente foi anonimizado e não aceita novo consentimento.'
      using errcode = '22023';
  end if;

  insert into public.customer_consents as consent (
    tenant_id, customer_id, purpose, granted, granted_at, recorded_by, source
  )
  values (
    v_customer.tenant_id,
    v_customer.id,
    p_purpose,
    p_granted,
    now(),
    (select auth.uid()),
    nullif(trim(coalesce(p_source, '')), '')
  )
  on conflict (tenant_id, customer_id, purpose) do update
  set granted     = excluded.granted,
      granted_at  = now(),
      recorded_by = excluded.recorded_by,
      source      = excluded.source
  returning * into v_consent;

  perform public.write_audit_log(
    v_customer.tenant_id,
    case when p_granted then 'consent_grant' else 'consent_revoke' end,
    'customer_consent',
    v_customer.id,
    jsonb_build_object('purpose', p_purpose)
  );

  return v_consent;
end;
$$;

-- ---------------------------------------------------------------------------
-- O DELETE de cliente que o schema torna impossível
-- ---------------------------------------------------------------------------
-- Mesma classe do C-11 (profissional) e do C-12 (empresa), que a LGPD fechou — e
-- deixou passar em `customers`.
--
-- `customers_delete_administrator` (`20260824000100:429-431`) promete o DELETE. Mas
-- sete FKs apontam para `customers` com `on delete restrict`: appointments,
-- automotive_vehicles, automotive_work_orders, automotive_loyalty_entries,
-- appointment_ratings, appointment_recurrences e appointment_waitlist.
--
-- O resultado depende do histórico, que é a pior forma de inconsistência:
--   com histórico → 23503 cru na cara do usuário;
--   sem histórico → apaga de verdade, levando contato, consentimento e vínculo por
--   cascade, e sem nenhuma linha de auditoria.
--
-- Os dois caminhos certos já existem: `active = false` para "não atende mais",
-- `anonymize_customer` para o direito ao esquecimento — este último com trilha.

drop policy if exists customers_delete_administrator on public.customers;
revoke delete on public.customers from authenticated;

-- ---------------------------------------------------------------------------
-- Índice que faltava
-- ---------------------------------------------------------------------------
-- Os dois índices de `customer_contacts` — a PK e o `unique (customer_id, tenant_id)`
-- — lideram ambos por `customer_id`. Todo `where tenant_id = $1` era varredura
-- sequencial: a lista de clientes com contato, a busca por telefone, e o
-- `delete from customer_contacts where tenant_id = ...` dentro de `delete_business`.

create index customer_contacts_tenant_idx on public.customer_contacts (tenant_id);

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke all on function public.clear_customer_contact_fields(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.clear_customer_contact_fields(uuid, text[]) to authenticated;

revoke all on function public.record_customer_consent(uuid, public.consent_purpose, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_customer_consent(uuid, public.consent_purpose, boolean, text)
  to authenticated;

comment on table public.customer_contacts is
  'Dado pessoal do cliente, separado do cadastro operacional (C-8). Leitura por '
  'política, escrita SÓ por `upsert_customer_contact` e `clear_customer_contact_fields` '
  '— é onde a guarda de anonimização mora e onde a trilha é gravada.';
