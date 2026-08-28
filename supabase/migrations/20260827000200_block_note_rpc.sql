-- Gravar o motivo de um bloqueio depois que ele já existe.
--
-- POR QUE ISTO FALTAVA
--
-- `create_scheduling_block` recebe o motivo como parâmetro e grava os dois juntos, numa
-- transação — que é o desenho certo e continua sendo o caminho preferido.
--
-- Mas o aplicativo não trabalha assim. `BloqueiosScreen` cria o bloqueio e SÓ ENTÃO
-- chama `upsertMotivoBloqueio(barbeiroId, bloqueioId, motivo)`, porque no Firestore o
-- motivo vivia numa subcoleção separada — `barbeiros/{id}/bloqueiosPrivados/{id}` — de
-- propósito: o array público de bloqueios é lido por qualquer cliente logado para montar
-- o calendário, e "consulta médica" não podia estar nele.
--
-- A separação era boa e a nossa RLS já a preserva melhor: `scheduling_block_notes` tem
-- política própria, restrita a quem agenda e ao próprio profissional.
--
-- O QUE EU NÃO FIZ, E POR QUÊ
--
-- Podia mudar a tela para passar o motivo na criação. Seria o desenho mais limpo — e
-- quebraria a promessa deste porte, que é as 48 telas não precisarem mudar. A camada de
-- repositório existe exatamente para absorver essa diferença; se a primeira dificuldade
-- já vaza para a tela, ela não estava absorvendo nada.
--
-- ESCRITA DIRETA CONTINUA REVOGADA. `scheduling_block_notes` segue com `grant select`
-- apenas. O motivo é texto livre — o campo mais provável de conter dado pessoal de
-- verdade — e passar por função é o que garante a checagem de papel e o vínculo com o
-- tenant correto.

create or replace function public.set_scheduling_block_note(
  p_reservation_id uuid,
  p_note text
)
returns public.scheduling_block_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva public.scheduling_resource_reservations;
  v_nota public.scheduling_block_notes;
  v_texto text;
begin
  select *
  into v_reserva
  from public.scheduling_resource_reservations reserva
  where reserva.id = p_reservation_id;

  if not found then
    raise exception 'Bloqueio não encontrado' using errcode = 'P0001';
  end if;

  -- Só bloqueio tem motivo. Um agendamento tem `appointments.notes`, que é outra coisa,
  -- com outra política e outro público.
  if v_reserva.kind <> 'block' then
    raise exception 'Só um bloqueio de agenda aceita motivo.' using errcode = '22023';
  end if;

  if not public.is_tenant_scheduler(v_reserva.tenant_id) then
    raise exception 'Only a scheduler can write a block reason' using errcode = '42501';
  end if;

  v_texto := nullif(trim(coalesce(p_note, '')), '');

  -- Texto vazio APAGA. É o que a tela espera ao limpar o campo, e guardar string vazia
  -- criaria uma terceira leitura entre "sem motivo" e "motivo em branco".
  if v_texto is null then
    delete from public.scheduling_block_notes nota
    where nota.reservation_id = p_reservation_id;
    return null;
  end if;

  insert into public.scheduling_block_notes as nota (
    reservation_id, tenant_id, note, created_by
  )
  values (p_reservation_id, v_reserva.tenant_id, v_texto, (select auth.uid()))
  on conflict (reservation_id) do update
  set note = excluded.note
  returning * into v_nota;

  return v_nota;
end;
$$;

revoke all on function public.set_scheduling_block_note(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_scheduling_block_note(uuid, text) to authenticated;

comment on function public.set_scheduling_block_note(uuid, text) is
  'Grava ou apaga o motivo de um bloqueio já existente. `create_scheduling_block` '
  'continua sendo o caminho preferido — ele grava os dois numa transação. Esta existe '
  'porque o aplicativo cria o bloqueio primeiro e o motivo depois, herança de como o '
  'Firestore separava as duas coisas.';
