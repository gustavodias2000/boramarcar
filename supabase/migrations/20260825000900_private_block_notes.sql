-- Etapa 4 — o motivo do bloqueio vira dado privado.
--
-- O PADRÃO, VINDO DO BARBERSHOP
--
-- Lá, o bloqueio de horário é dividido em dois: o intervalo fica no documento público
-- do profissional, porque a vitrine precisa mostrar indisponibilidade; o MOTIVO fica
-- numa subcoleção privada. O comentário do código explica por quê: *"o motivo é dado
-- pessoal do barbeiro"*.
--
-- Aqui a divisão não existia. `scheduling_resource_reservations.reason` guarda o texto
-- que o operador digitou — "consulta médica", "terapia", "funeral" — e a política de
-- leitura é `is_active_business_member`. Ou seja: qualquer colega lê o motivo de
-- qualquer bloqueio da empresa.
--
-- É o mesmo achado C-8 em escala menor: isolamento entre empresas está firme, mas
-- dentro da empresa não há segregação nenhuma.
--
-- O QUE MUDA
--
-- `reason` deixa de ser texto livre e passa a ser MARCADOR DE ORIGEM, não pessoal:
-- 'manual_block' ou 'automotive_work_order_box'. O texto humano vai para
-- `scheduling_block_notes`, legível só por quem agenda ou pelo próprio profissional.
--
-- A disponibilidade continua pública para a equipe. O que some é o porquê.

create table public.scheduling_block_notes (
  reservation_id uuid primary key,
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  note text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (reservation_id, tenant_id),
  constraint scheduling_block_notes_note_length check (
    char_length(trim(note)) between 1 and 500
  ),
  constraint scheduling_block_notes_reservation_belongs_to_tenant
    foreign key (reservation_id, tenant_id)
    references public.scheduling_resource_reservations (id, tenant_id)
    on delete cascade
);

alter table public.scheduling_block_notes enable row level security;

-- Quem agenda vê tudo — precisa, para administrar a equipe. O profissional vê o
-- próprio. Ninguém mais vê nada, nem o técnico do box ao lado, nem o caixa.
create policy scheduling_block_notes_select_scheduler_or_owner
on public.scheduling_block_notes for select to authenticated
using (
  public.is_tenant_scheduler(tenant_id)
  or exists (
    select 1
    from public.scheduling_resource_reservations reservation
    join public.scheduling_resources resource
      on resource.id = reservation.scheduling_resource_id
      and resource.tenant_id = reservation.tenant_id
    where reservation.id = scheduling_block_notes.reservation_id
      and reservation.tenant_id = scheduling_block_notes.tenant_id
      and public.is_current_user_professional(resource.professional_id, resource.tenant_id)
  )
);

-- Escrita só pela RPC que cria o bloqueio: o texto e o intervalo nascem juntos.
revoke all on public.scheduling_block_notes from anon, authenticated;
grant select on public.scheduling_block_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Migrar o que já existe
-- ---------------------------------------------------------------------------
-- Todo motivo humano já gravado é movido para a tabela privada antes de o campo
-- público ser normalizado. Nada se perde e nada continua exposto.

insert into public.scheduling_block_notes (reservation_id, tenant_id, note, created_by, created_at)
select
  reservation.id,
  reservation.tenant_id,
  trim(reservation.reason),
  reservation.created_by,
  reservation.created_at
from public.scheduling_resource_reservations reservation
where reservation.kind = 'block'
  and reservation.reason is not null
  and trim(reservation.reason) <> ''
  and reservation.reason <> 'automotive_work_order_box'
on conflict (reservation_id) do nothing;

update public.scheduling_resource_reservations reservation
set reason = 'manual_block'
where reservation.kind = 'block'
  and coalesce(reservation.reason, '') <> 'automotive_work_order_box';

comment on column public.scheduling_resource_reservations.reason is
  'Marcador de origem do bloqueio, não texto pessoal: manual_block ou '
  'automotive_work_order_box. O motivo humano vive em scheduling_block_notes.';

-- ---------------------------------------------------------------------------
-- A criação de bloqueio passa a separar as duas coisas
-- ---------------------------------------------------------------------------

create or replace function public.create_scheduling_block(
  p_scheduling_resource_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource public.scheduling_resources;
  v_reservation_id uuid;
  v_note text;
begin
  select *
  into v_resource
  from public.scheduling_resources resource
  where resource.id = p_scheduling_resource_id
    and resource.active;

  if not found then
    raise exception 'Active scheduling resource not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_resource.tenant_id)
    and not public.is_current_user_professional(v_resource.professional_id, v_resource.tenant_id) then
    raise exception 'You cannot block this scheduling resource' using errcode = '42501';
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'The block interval must have a positive duration' using errcode = '22023';
  end if;

  insert into public.scheduling_resource_reservations (
    tenant_id, scheduling_resource_id, kind, start_at, end_at, reason, created_by
  )
  values (
    v_resource.tenant_id,
    p_scheduling_resource_id,
    'block',
    p_start_at,
    p_end_at,
    'manual_block',
    (select auth.uid())
  )
  returning id into v_reservation_id;

  v_note := nullif(trim(coalesce(p_reason, '')), '');

  if v_note is not null then
    insert into public.scheduling_block_notes (reservation_id, tenant_id, note, created_by)
    values (v_reservation_id, v_resource.tenant_id, v_note, (select auth.uid()));
  end if;

  return v_reservation_id;
end;
$$;

revoke all on function public.create_scheduling_block(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.create_scheduling_block(uuid, timestamptz, timestamptz, text)
  to authenticated;

comment on table public.scheduling_block_notes is
  'Motivo do bloqueio de agenda. Separado do intervalo porque é dado pessoal do '
  'profissional: a equipe precisa saber QUANDO ele está indisponível, não POR QUÊ.';
