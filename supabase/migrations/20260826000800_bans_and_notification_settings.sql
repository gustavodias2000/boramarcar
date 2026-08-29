-- Os três repositórios do Barbershop que ainda não tinham tabela aqui.
--
-- `BanimentoRepository`, `NotificationRepository` e `RelatorioEmailRepository` eram os
-- únicos de catorze sem correspondência no schema. Os outros onze já existiam.
--
-- Modelados a partir do que o Barbershop faz de verdade, não do que seria bonito:
-- os padrões abaixo são os dele (`CONFIGURACAO_NOTIFICACOES_PADRAO` e
-- `CONFIGURACAO_RELATORIO_EMAIL_PADRAO` em `src/types.ts:281` e `:302`).

-- ---------------------------------------------------------------------------
-- Banimento de cliente
-- ---------------------------------------------------------------------------
-- No Barbershop é `barbeiros/{id}/banidos/{uid}`: o cliente que não é mais bem-vindo
-- naquele negócio. Aqui vira tabela própria em vez de coluna em `customers`, por três
-- motivos concretos:
--
--   1. carrega QUEM baniu e QUANDO, que é o que transforma a decisão em auditável;
--   2. a ausência de linha é a leitura natural de "não banido", sem default a inverter;
--   3. o motivo é texto livre — o campo mais provável de conter dado sensível de
--      verdade — e assim ele fica atrás de política própria, como já foi feito com
--      `scheduling_block_notes` e com `customer_contacts`.
--
-- `active = false` em `customers` continua significando outra coisa: "não atende mais".
-- Banir é o cliente que a empresa recusa; inativar é o cadastro que saiu de circulação.

create table public.customer_bans (
  customer_id uuid primary key,
  tenant_id uuid not null references public.businesses (id) on delete cascade,

  /** Texto livre. Dado pessoal por natureza — daí a política restrita abaixo. */
  reason text,

  banned_at timestamptz not null default now(),
  banned_by uuid references auth.users (id) on delete set null,

  unique (customer_id, tenant_id),
  constraint customer_bans_reason_length check (
    reason is null or char_length(trim(reason)) between 1 and 500
  ),
  constraint customer_bans_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade
);

create index customer_bans_tenant_idx on public.customer_bans (tenant_id, banned_at desc);

alter table public.customer_bans enable row level security;

-- Quem agenda precisa saber que a pessoa está banida — senão a recusa no agendamento
-- vira um erro sem explicação no balcão. O motivo vem junto porque é quem atende que
-- precisa dele para conversar.
create policy customer_bans_select_scheduler
on public.customer_bans for select to authenticated
using (public.is_tenant_scheduler(tenant_id));

revoke all on public.customer_bans from anon, authenticated;
grant select on public.customer_bans to authenticated;

create or replace function public.ban_customer(
  p_customer_id uuid,
  p_reason text default null
)
returns public.customer_bans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_ban public.customer_bans;
begin
  select *
  into v_customer
  from public.customers customer
  where customer.id = p_customer_id;

  if not found then
    raise exception 'Cliente não encontrado' using errcode = 'P0001';
  end if;

  if not public.is_tenant_administrator(v_customer.tenant_id) then
    raise exception 'Only an administrator can ban a customer' using errcode = '42501';
  end if;

  insert into public.customer_bans as ban (customer_id, tenant_id, reason, banned_by)
  values (
    v_customer.id,
    v_customer.tenant_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    (select auth.uid())
  )
  on conflict (customer_id) do update
  set reason = coalesce(excluded.reason, ban.reason),
      banned_at = now(),
      banned_by = excluded.banned_by
  returning * into v_ban;

  perform public.write_audit_log(
    v_customer.tenant_id, 'ban', 'customer', v_customer.id, '{}'::jsonb
  );

  return v_ban;
end;
$$;

create or replace function public.unban_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select ban.tenant_id
  into v_tenant_id
  from public.customer_bans ban
  where ban.customer_id = p_customer_id;

  if not found then
    return;
  end if;

  if not public.is_tenant_administrator(v_tenant_id) then
    raise exception 'Only an administrator can lift a ban' using errcode = '42501';
  end if;

  delete from public.customer_bans ban where ban.customer_id = p_customer_id;

  perform public.write_audit_log(v_tenant_id, 'unban', 'customer', p_customer_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- O banimento tem que IMPEDIR o agendamento
-- ---------------------------------------------------------------------------
-- Sem isto a tabela é decorativa: a empresa marca "banido" e o sistema continua
-- aceitando o horário. A recusa vai no gatilho, e não na tela, porque tela se contorna.

create or replace function public.reject_banned_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.customer_bans ban
    where ban.customer_id = new.customer_id and ban.tenant_id = new.tenant_id
  ) then
    raise exception 'Este cliente está impedido de agendar nesta empresa.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_reject_banned on public.appointments;

create trigger appointments_reject_banned
before insert on public.appointments
for each row
execute function public.reject_banned_customer();

-- ---------------------------------------------------------------------------
-- Notificações e relatório por e-mail
-- ---------------------------------------------------------------------------
-- Uma linha por empresa, com os padrões do Barbershop. Colunas, não `jsonb`: o conjunto
-- é fechado e conhecido, e coluna aceita CHECK — `jsonb` transferiria a validação para
-- o código da aplicação, que é o oposto do que este projeto faz.
--
-- Relatório por e-mail mora na MESMA linha porque é assim no Barbershop, e a razão dele
-- é boa: uma equipe recebe um relatório consolidado só, administrado pelo dono.

create type public.notification_channel as enum ('push', 'whatsapp', 'sms', 'email');

create table public.business_notification_settings (
  tenant_id uuid primary key references public.businesses (id) on delete cascade,

  -- canais
  canal_push boolean not null default true,
  canal_whatsapp boolean not null default true,
  canal_sms boolean not null default false,

  -- eventos
  evento_novo_agendamento boolean not null default true,
  evento_confirmacao boolean not null default true,
  evento_cancelamento boolean not null default true,
  evento_lembrete boolean not null default true,

  -- lembrete de retorno: "faz N dias que não aparece"
  retorno_ativo boolean not null default false,
  retorno_dias integer not null default 30,
  retorno_canal public.notification_channel not null default 'push',

  -- resumo financeiro por e-mail
  relatorio_semanal boolean not null default true,
  relatorio_mensal boolean not null default false,
  /** Nulo usa o e-mail da conta do dono, preservando o comportamento do Barbershop. */
  relatorio_email text,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  constraint notification_settings_retorno_range check (retorno_dias between 7 and 365)
);

create trigger business_notification_settings_set_updated_at
before update on public.business_notification_settings
for each row
execute function public.set_updated_at();

-- Toda empresa que já existe nasce com o padrão, para a tela nunca precisar tratar
-- "linha ausente" — que no Barbershop era resolvido mesclando defaults na leitura.
insert into public.business_notification_settings (tenant_id)
select business.id from public.businesses business
on conflict (tenant_id) do nothing;

alter table public.business_notification_settings enable row level security;

create policy notification_settings_select_member
on public.business_notification_settings for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy notification_settings_update_administrator
on public.business_notification_settings for update to authenticated
using (public.is_tenant_administrator(tenant_id))
with check (public.is_tenant_administrator(tenant_id));

revoke all on public.business_notification_settings from anon, authenticated;
grant select on public.business_notification_settings to authenticated;
grant update (
  canal_push, canal_whatsapp, canal_sms,
  evento_novo_agendamento, evento_confirmacao, evento_cancelamento, evento_lembrete,
  retorno_ativo, retorno_dias, retorno_canal,
  relatorio_semanal, relatorio_mensal, relatorio_email
) on public.business_notification_settings to authenticated;

-- Empresa nova também nasce com a linha.
create or replace function public.seed_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_notification_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return null;
end;
$$;

drop trigger if exists businesses_seed_notification_settings on public.businesses;

create trigger businesses_seed_notification_settings
after insert on public.businesses
for each row
execute function public.seed_notification_settings();

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------

revoke all on function public.ban_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.ban_customer(uuid, text) to authenticated;

revoke all on function public.unban_customer(uuid) from public, anon, authenticated;
grant execute on function public.unban_customer(uuid) to authenticated;

revoke all on function public.reject_banned_customer() from public, anon, authenticated;
revoke all on function public.seed_notification_settings() from public, anon, authenticated;

comment on table public.business_notification_settings is
  'Preferência de notificação e de relatório por e-mail, uma linha por empresa. A TABELA '
  'EXISTE E O ENVIO NÃO: não há outbox nem worker, e nada lê estas colunas ainda. Quando '
  'o envio chegar, checar consentimento em `customer_consents` é pré-condição da RPC de '
  'envio, não checagem de tela.';

comment on table public.customer_bans is
  'Cliente impedido de agendar nesta empresa. Diferente de `customers.active = false`, '
  'que significa "cadastro fora de circulação". A recusa é imposta por gatilho em '
  '`appointments`, não pela interface.';
