-- Etapa 4 — agendamento recorrente.
--
-- Cliente fixo com dia da semana e horário definidos. Existe no Barbershop, não estava
-- no Contexto Mestre, e é núcleo: manicure, barbearia e massoterapia vivem disso.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--
-- Não materializa agendamentos sozinha. Recorrência aqui é uma REGRA, e cada
-- agendamento nasce de uma chamada explícita — que passa pelas mesmas validações de
-- qualquer outro: disponibilidade, almoço, buffer, conflito de recurso.
--
-- Gerar em lote pertence à Etapa 9, quando existir execução server-side. Fazer isso
-- por gatilho seria pior: um agendamento criado sem ninguém olhando, que colide com a
-- agenda e falha silenciosamente, é a origem clássica de agenda furada.

create type public.recurrence_frequency as enum ('weekly', 'biweekly', 'monthly');

create table public.appointment_recurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,

  weekday smallint not null,
  starts_at time not null,
  frequency public.recurrence_frequency not null default 'weekly',

  active boolean not null default true,
  /** Última data já gerada. É o que impede gerar duas vezes o mesmo ciclo. */
  last_generated_on date,
  notes text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, tenant_id),
  constraint appointment_recurrences_weekday check (weekday between 0 and 6),
  constraint appointment_recurrences_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete cascade,
  constraint appointment_recurrences_service_belongs_to_tenant
    foreign key (service_id, tenant_id)
    references public.services (id, tenant_id)
    on delete restrict,
  constraint appointment_recurrences_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict
);

create index appointment_recurrences_lookup_idx
  on public.appointment_recurrences (tenant_id, weekday, starts_at)
  where active;

create trigger appointment_recurrences_set_updated_at
before update on public.appointment_recurrences
for each row
execute function public.set_updated_at();

alter table public.appointment_recurrences enable row level security;

create policy appointment_recurrences_select_member
on public.appointment_recurrences for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy appointment_recurrences_manage_scheduler
on public.appointment_recurrences for all to authenticated
using (public.is_tenant_scheduler(tenant_id))
with check (public.is_tenant_scheduler(tenant_id));

revoke all on public.appointment_recurrences from anon, authenticated;
grant select, insert, update, delete on public.appointment_recurrences to authenticated;

-- ---------------------------------------------------------------------------
-- Gerar um agendamento a partir da recorrência
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurrence_appointment(
  p_recurrence_id uuid,
  p_date date
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurrence public.appointment_recurrences;
  v_timezone text;
  v_start_at timestamptz;
  v_minimo integer;
  v_appointment public.appointments;
begin
  select *
  into v_recurrence
  from public.appointment_recurrences recurrence
  where recurrence.id = p_recurrence_id
  for update;

  if not found then
    raise exception 'Recorrência não encontrada' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_recurrence.tenant_id) then
    raise exception 'Only a scheduler can generate a recurring appointment' using errcode = '42501';
  end if;

  if not v_recurrence.active then
    raise exception 'Esta recorrência está desativada.' using errcode = '22023';
  end if;

  if extract(dow from p_date)::smallint <> v_recurrence.weekday then
    raise exception 'A data não corresponde ao dia da semana da recorrência.'
      using errcode = '22023';
  end if;

  -- Guarda de cadência: impede gerar dois ciclos na mesma janela.
  if v_recurrence.last_generated_on is not null then
    v_minimo := case v_recurrence.frequency
      when 'weekly' then 7
      when 'biweekly' then 14
      when 'monthly' then 28
    end;

    if p_date < v_recurrence.last_generated_on + v_minimo then
      raise exception
        'A recorrência % já foi gerada para %; o próximo ciclo começa em %.',
        v_recurrence.frequency,
        v_recurrence.last_generated_on,
        v_recurrence.last_generated_on + v_minimo
        using errcode = '22023';
    end if;
  end if;

  select business.timezone
  into v_timezone
  from public.businesses business
  where business.id = v_recurrence.tenant_id;

  -- O horário da recorrência é local: 09:00 é nove da manhã na empresa, não em UTC.
  v_start_at := (p_date + v_recurrence.starts_at) at time zone v_timezone;

  -- Passa pelas mesmas validações de qualquer agendamento — disponibilidade, almoço,
  -- buffer, antecedência e conflito de recurso. Uma recorrência não fura a agenda.
  select *
  into v_appointment
  from public.create_staff_appointment(
    v_recurrence.tenant_id,
    v_recurrence.customer_id,
    v_recurrence.service_id,
    v_recurrence.professional_id,
    v_start_at,
    v_recurrence.notes
  );

  update public.appointment_recurrences recurrence
  set last_generated_on = p_date
  where recurrence.id = v_recurrence.id;

  return v_appointment;
end;
$$;

revoke all on function public.generate_recurrence_appointment(uuid, date)
  from public, anon, authenticated;
grant execute on function public.generate_recurrence_appointment(uuid, date) to authenticated;

comment on table public.appointment_recurrences is
  'Regra de agendamento recorrente. Não materializa sozinha: cada agendamento nasce '
  'de uma chamada explícita que passa pelas validações normais da agenda.';
