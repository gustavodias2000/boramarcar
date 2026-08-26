-- Etapa 4 — configuração de agenda completa.
--
-- A extração do Barbershop (docs/barbershop-extracao-dominio.md) mediu a maior lacuna
-- isolada do núcleo: `ConfiguracaoAgenda` de lá tem nove campos, o
-- `professional_schedule_rules` daqui tem três. Faltam intervalo de almoço,
-- antecedência mínima e máxima, buffer entre atendimentos e turno extra.
--
-- Nenhum é enfeite:
--
--   buffer            essencial em estética automotiva e tatuagem — o box e a maca
--                     precisam de limpeza entre um atendimento e o próximo;
--   antecedência mín. impede o cliente agendar para daqui a cinco minutos;
--   antecedência máx. impede agenda lotada com seis meses de antecedência;
--   turno extra       barbearia abre à noite, e o turno noturno não tem almoço;
--   almoço            recorte dentro da jornada, não uma segunda regra.
--
-- É CORE, não de categoria. Toda categoria com agenda precisa disto.
--
-- COMPATIBILIDADE: a tabela é opcional. Profissional sem linha aqui continua se
-- comportando exatamente como antes — os padrões desligam todos os recursos novos.

create table public.professional_schedule_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid not null,

  -- Almoço. Os dois nulos desativam o intervalo.
  lunch_starts_at time,
  lunch_ends_at time,

  -- Antecedência mínima para agendar, em minutos. 0 = sem restrição.
  min_notice_minutes integer not null default 0,

  -- Quão longe no futuro se pode agendar, em dias. 0 = sem limite.
  max_advance_days integer not null default 0,

  -- Descanso e limpeza depois de cada atendimento, em minutos. 0 = sem buffer.
  buffer_after_minutes integer not null default 0,

  -- Turno extra (por exemplo, noturno). Não recebe o intervalo de almoço.
  extra_shift_active boolean not null default false,
  extra_shift_starts_at time,
  extra_shift_ends_at time,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, professional_id),
  unique (id, tenant_id),

  constraint professional_schedule_settings_lunch_pair check (
    (lunch_starts_at is null and lunch_ends_at is null)
    or (lunch_starts_at is not null and lunch_ends_at is not null and lunch_ends_at > lunch_starts_at)
  ),
  constraint professional_schedule_settings_min_notice check (
    min_notice_minutes between 0 and 43200
  ),
  constraint professional_schedule_settings_max_advance check (
    max_advance_days between 0 and 730
  ),
  constraint professional_schedule_settings_buffer check (
    buffer_after_minutes between 0 and 480
  ),
  constraint professional_schedule_settings_extra_shift check (
    (not extra_shift_active)
    or (
      extra_shift_starts_at is not null
      and extra_shift_ends_at is not null
      and extra_shift_ends_at > extra_shift_starts_at
    )
  ),
  constraint professional_schedule_settings_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete cascade
);

create trigger professional_schedule_settings_set_updated_at
before update on public.professional_schedule_settings
for each row
execute function public.set_updated_at();

alter table public.professional_schedule_settings enable row level security;

create policy professional_schedule_settings_select_member
on public.professional_schedule_settings for select to authenticated
using (public.is_active_business_member(tenant_id));

-- Mesma regra da disponibilidade recorrente: a recepção e a gestão ajustam a equipe,
-- e o profissional ajusta o próprio horário.
create policy professional_schedule_settings_manage_scheduler_or_self
on public.professional_schedule_settings for all to authenticated
using (
  public.is_tenant_scheduler(tenant_id)
  or public.is_current_user_professional(professional_id, tenant_id)
)
with check (
  public.is_tenant_scheduler(tenant_id)
  or public.is_current_user_professional(professional_id, tenant_id)
);

revoke all on public.professional_schedule_settings from anon, authenticated;
grant select, insert, update, delete on public.professional_schedule_settings to authenticated;

-- ---------------------------------------------------------------------------
-- A verificação de disponibilidade passa a honrar a configuração
-- ---------------------------------------------------------------------------

create or replace function public.require_available_professional_resource(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_id uuid;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday smallint;
  v_settings public.professional_schedule_settings;
  v_buffer interval;
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'The reservation interval must have a positive duration' using errcode = '22023';
  end if;

  select business.timezone
  into v_timezone
  from public.businesses business
  where business.id = p_tenant_id
    and business.active;

  if not found then
    raise exception 'Active business not found' using errcode = 'P0001';
  end if;

  select resource.id
  into v_resource_id
  from public.scheduling_resources resource
  where resource.tenant_id = p_tenant_id
    and resource.professional_id = p_professional_id
    and resource.kind = 'professional'
    and resource.active;

  if not found then
    raise exception 'Active professional resource not found' using errcode = 'P0001';
  end if;

  v_local_start := p_start_at at time zone v_timezone;
  v_local_end := p_end_at at time zone v_timezone;

  if v_local_start::date <> v_local_end::date then
    raise exception 'An appointment cannot span two local business days' using errcode = '22023';
  end if;

  -- Ausência de linha significa comportamento anterior: todos os recursos desligados.
  select *
  into v_settings
  from public.professional_schedule_settings settings
  where settings.tenant_id = p_tenant_id
    and settings.professional_id = p_professional_id;

  if found then
    if v_settings.min_notice_minutes > 0
      and p_start_at < now() + make_interval(mins => v_settings.min_notice_minutes) then
      raise exception
        'Este horário exige pelo menos % minutos de antecedência.', v_settings.min_notice_minutes
        using errcode = '22023';
    end if;

    if v_settings.max_advance_days > 0
      and p_start_at > now() + make_interval(days => v_settings.max_advance_days) then
      raise exception
        'A agenda aceita marcação com no máximo % dias de antecedência.', v_settings.max_advance_days
        using errcode = '22023';
    end if;

    if v_settings.lunch_starts_at is not null
      and v_local_start::time < v_settings.lunch_ends_at
      and v_local_end::time > v_settings.lunch_starts_at then
      raise exception 'Este horário cai no intervalo de almoço do profissional.'
        using errcode = 'P0001';
    end if;
  end if;

  v_weekday := extract(dow from v_local_start)::smallint;

  -- A janela pode vir da disponibilidade recorrente OU do turno extra. O turno extra
  -- é um segundo bloco do mesmo dia e não recebe o intervalo de almoço.
  if not exists (
    select 1
    from public.professional_schedule_rules rule
    where rule.tenant_id = p_tenant_id
      and rule.professional_id = p_professional_id
      and rule.weekday = v_weekday
      and rule.active
      and rule.starts_at <= v_local_start::time
      and rule.ends_at >= v_local_end::time
  ) and not (
    coalesce(v_settings.extra_shift_active, false)
    and v_settings.extra_shift_starts_at <= v_local_start::time
    and v_settings.extra_shift_ends_at >= v_local_end::time
  ) then
    raise exception 'Professional is unavailable for the requested interval' using errcode = 'P0001';
  end if;

  -- Com buffer, a folga também precisa estar livre: o intervalo examinado cresce dos
  -- dois lados. Sem buffer o comportamento é idêntico ao anterior.
  v_buffer := make_interval(mins => coalesce(v_settings.buffer_after_minutes, 0));

  if exists (
    select 1
    from public.scheduling_resource_reservations reservation
    where reservation.scheduling_resource_id = v_resource_id
      and (reservation.kind = 'block' or v_buffer > interval '0')
      and tstzrange(reservation.start_at, reservation.end_at, '[)')
          && tstzrange(p_start_at - v_buffer, p_end_at + v_buffer, '[)')
  ) then
    if v_buffer > interval '0' then
      raise exception
        'Este horário não respeita o intervalo de % minutos entre atendimentos.',
        v_settings.buffer_after_minutes
        using errcode = 'P0001';
    end if;

    raise exception 'The requested interval is blocked' using errcode = 'P0001';
  end if;

  return v_resource_id;
end;
$$;

-- Continua sem grant: só é chamada de dentro de funções SECURITY DEFINER.
revoke all on function public.require_available_professional_resource(
  uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;

comment on table public.professional_schedule_settings is
  'Configuração de agenda do profissional: almoço, antecedência mínima e máxima, '
  'buffer entre atendimentos e turno extra. Linha ausente = comportamento sem restrição.';
