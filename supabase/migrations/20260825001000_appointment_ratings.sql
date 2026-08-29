-- Etapa 4 — avaliação de atendimento.
--
-- O Barbershop tem avaliação, e o Contexto Mestre não a mencionava. A extração
-- também mostrou que lá ela é um SEXTO STATUS do agendamento: `avaliado`, depois de
-- `concluido`.
--
-- Aqui ela é entidade própria, e a decisão está registrada no §26 do Contexto Mestre:
-- um status que existe só para marcar "já avaliou" mistura duas dimensões. O
-- agendamento descreve a execução do serviço; a avaliação descreve o que o cliente
-- achou. Uma pode existir sem a outra, e o ciclo de vida das duas é diferente.
--
-- QUEM AVALIA
--
-- Hoje, a recepção registra o que o cliente disse — não existe área do cliente. A
-- Etapa 10 acrescenta o caminho do próprio cliente sem mexer nesta tabela: muda só
-- quem tem permissão de inserir.

create table public.appointment_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  appointment_id uuid not null,
  customer_id uuid not null,
  professional_id uuid,
  rating smallint not null,
  comment text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Uma avaliação por atendimento. Reavaliar é editar, não acumular.
  unique (appointment_id),
  unique (id, tenant_id),

  constraint appointment_ratings_scale check (rating between 1 and 5),
  constraint appointment_ratings_comment_length check (
    comment is null or char_length(trim(comment)) between 1 and 1000
  ),
  constraint appointment_ratings_appointment_belongs_to_tenant
    foreign key (appointment_id, tenant_id)
    references public.appointments (id, tenant_id)
    on delete cascade,
  constraint appointment_ratings_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete restrict,
  constraint appointment_ratings_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict
);

create index appointment_ratings_tenant_professional_idx
  on public.appointment_ratings (tenant_id, professional_id, created_at desc);

alter table public.appointment_ratings enable row level security;

create policy appointment_ratings_select_member
on public.appointment_ratings for select to authenticated
using (public.is_active_business_member(tenant_id));

revoke all on public.appointment_ratings from anon, authenticated;
grant select on public.appointment_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- Registrar a avaliação
-- ---------------------------------------------------------------------------
-- Cliente e profissional são copiados do agendamento em vez de recebidos como
-- parâmetro: quem avalia não escolhe quem foi avaliado.

create or replace function public.record_appointment_rating(
  p_appointment_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns public.appointment_ratings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_rating public.appointment_ratings;
begin
  select *
  into v_appointment
  from public.appointments appointment
  where appointment.id = p_appointment_id;

  if not found then
    raise exception 'Appointment not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_appointment.tenant_id) then
    raise exception 'Only a scheduler can record a rating' using errcode = '42501';
  end if;

  -- Avaliar o que ainda não aconteceu não descreve nada.
  if v_appointment.status <> 'completed' then
    raise exception 'Somente um atendimento concluído pode ser avaliado.'
      using errcode = '22023';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'A nota deve estar entre 1 e 5.' using errcode = '22023';
  end if;

  insert into public.appointment_ratings (
    tenant_id, appointment_id, customer_id, professional_id, rating, comment, recorded_by
  )
  values (
    v_appointment.tenant_id,
    v_appointment.id,
    v_appointment.customer_id,
    v_appointment.professional_id,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    (select auth.uid())
  )
  on conflict (appointment_id) do update
  set rating = excluded.rating,
      comment = excluded.comment,
      recorded_by = excluded.recorded_by
  returning * into v_rating;

  return v_rating;
end;
$$;

revoke all on function public.record_appointment_rating(uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.record_appointment_rating(uuid, smallint, text) to authenticated;

comment on table public.appointment_ratings is
  'Avaliação do atendimento. Entidade própria, não status do agendamento: execução do '
  'serviço e opinião do cliente são dimensões diferentes.';
