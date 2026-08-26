-- Etapa 4 — lista de espera.
--
-- O cliente entra numa fila para uma data desejada e é avisado quando abre vaga.
-- Existe no Barbershop, não estava no Contexto Mestre, e é núcleo — a fila é a mesma
-- para barbearia, manicure e estética automotiva.
--
-- Estados: aguardando → notificado → agendado, ou expirado a qualquer momento.
-- `notificado` existe separado de `agendado` porque avisar não é confirmar: o cliente
-- pode ser avisado e não responder, e a vaga precisa voltar para a fila.

create type public.waitlist_status as enum ('waiting', 'notified', 'scheduled', 'expired');

create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid,
  /** Nulo = qualquer profissional serve, que é o caso comum da fila. */
  professional_id uuid,

  desired_date date not null,
  status public.waitlist_status not null default 'waiting',
  notes text,

  notified_at timestamptz,
  resolved_at timestamptz,
  /** Preenchido quando a espera vira agendamento. */
  appointment_id uuid,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, tenant_id),
  constraint appointment_waitlist_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade,
  constraint appointment_waitlist_service_belongs_to_tenant
    foreign key (service_id, tenant_id)
    references public.services (id, tenant_id)
    on delete restrict,
  constraint appointment_waitlist_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict,
  constraint appointment_waitlist_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete set null,
  constraint appointment_waitlist_scheduled_has_appointment check (
    status <> 'scheduled' or appointment_id is not null
  )
);

-- A fila é consultada por data e ordenada por chegada: quem esperou mais vem antes.
create index appointment_waitlist_queue_idx
  on public.appointment_waitlist (tenant_id, desired_date, created_at)
  where status in ('waiting', 'notified');

create trigger appointment_waitlist_set_updated_at
before update on public.appointment_waitlist
for each row
execute function public.set_updated_at();

alter table public.appointment_waitlist enable row level security;

create policy appointment_waitlist_select_member
on public.appointment_waitlist for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy appointment_waitlist_manage_scheduler
on public.appointment_waitlist for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.appointment_waitlist from anon, authenticated;
grant select, insert, update, delete on public.appointment_waitlist to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar como notificado
-- ---------------------------------------------------------------------------
-- Separado do agendamento de propósito: o aviso sai, o cliente pode não responder, e
-- a entrada continua na fila até virar agendamento ou expirar.

create or replace function public.mark_waitlist_notified(p_waitlist_id uuid)
returns public.appointment_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.appointment_waitlist;
begin
  select *
  into v_entry
  from public.appointment_waitlist entry
  where entry.id = p_waitlist_id
  for update;

  if not found then
    raise exception 'Entrada da lista de espera não encontrada' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_entry.tenant_id) then
    raise exception 'Only a scheduler can manage the waitlist' using errcode = '42501';
  end if;

  if v_entry.status <> 'waiting' then
    raise exception 'Somente uma espera aguardando pode ser marcada como notificada.'
      using errcode = '22023';
  end if;

  update public.appointment_waitlist entry
  set status = 'notified',
      notified_at = now()
  where entry.id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- Converter a espera em agendamento
-- ---------------------------------------------------------------------------

create or replace function public.schedule_from_waitlist(
  p_waitlist_id uuid,
  p_start_at timestamptz,
  p_service_id uuid default null,
  p_professional_id uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.appointment_waitlist;
  v_service_id uuid;
  v_professional_id uuid;
  v_appointment public.appointments;
begin
  select *
  into v_entry
  from public.appointment_waitlist entry
  where entry.id = p_waitlist_id
  for update;

  if not found then
    raise exception 'Entrada da lista de espera não encontrada' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_entry.tenant_id) then
    raise exception 'Only a scheduler can manage the waitlist' using errcode = '42501';
  end if;

  if v_entry.status not in ('waiting', 'notified') then
    raise exception 'Esta espera já foi resolvida.' using errcode = '22023';
  end if;

  -- A espera pode não ter serviço ou profissional definidos — a fila costuma ser
  -- "qualquer horário que abrir". O parâmetro completa o que faltava.
  v_service_id := coalesce(p_service_id, v_entry.service_id);
  v_professional_id := coalesce(p_professional_id, v_entry.professional_id);

  if v_service_id is null or v_professional_id is null then
    raise exception 'Informe serviço e profissional para agendar a partir da espera.'
      using errcode = '22023';
  end if;

  -- Passa pelas validações normais: a fila não fura a agenda.
  select *
  into v_appointment
  from public.create_staff_appointment(
    v_entry.tenant_id,
    v_entry.customer_id,
    v_service_id,
    v_professional_id,
    p_start_at,
    v_entry.notes
  );

  update public.appointment_waitlist entry
  set status = 'scheduled',
      appointment_id = v_appointment.id,
      resolved_at = now()
  where entry.id = v_entry.id;

  return v_appointment;
end;
$$;

revoke all on function public.mark_waitlist_notified(uuid) from public, anon, authenticated;
grant execute on function public.mark_waitlist_notified(uuid) to authenticated;

revoke all on function public.schedule_from_waitlist(uuid, timestamptz, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.schedule_from_waitlist(uuid, timestamptz, uuid, uuid)
  to authenticated;

comment on table public.appointment_waitlist is
  'Fila de espera por data desejada. `notified` é separado de `scheduled` porque '
  'avisar não é confirmar: o cliente pode não responder e a vaga volta para a fila.';
