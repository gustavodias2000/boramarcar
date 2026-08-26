-- Etapa 2 — foto removida deixa de ser legível (achado C-10).
--
-- O PROBLEMA
--
-- `can_read_automotive_work_order_media_object` validava apenas que o caminho tinha o
-- formato canônico e apontava para uma OS existente de um tenant do qual o usuário é
-- membro. Nunca consultava `automotive_work_order_media`.
--
-- A migration 20260824000800 tirou de propósito o `delete from storage.objects` de
-- dentro da RPC de remoção, delegando ao cliente apagar o arquivo. Se o cliente apagar
-- o metadado e falhar — ou simplesmente pular — a chamada à Storage API, o arquivo
-- continua no bucket E CONTINUA LEGÍVEL. A foto some da interface e permanece
-- acessível por URL assinada, sem nenhuma linha no banco que a torne rastreável.
--
-- A CORREÇÃO
--
-- O metadado passa a ser a autoridade. Sem linha em `automotive_work_order_media`, o
-- objeto é ilegível mesmo que o arquivo continue no bucket. O órfão fica inerte.
--
-- POR QUE SÓ A LEITURA
--
-- `can_manage_automotive_work_order_media_object` governa INSERT e DELETE em
-- `storage.objects` e continua baseada no caminho, de propósito:
--
--   - no upload, o metadado ainda NÃO existe: o cliente sobe o arquivo e só depois
--     chama `register_automotive_work_order_media`;
--   - na remoção, o metadado JÁ foi apagado pela RPC quando o cliente vai limpar o
--     objeto.
--
-- Exigir o metadado em qualquer uma das duas quebraria o fluxo que ela protege.

create or replace function public.can_read_automotive_work_order_media_object(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.automotive_work_order_media media
    where media.storage_path = p_storage_path
      and public.is_active_business_member(media.tenant_id)
  );
$$;

revoke all on function public.can_read_automotive_work_order_media_object(text)
  from public, anon, authenticated;
grant execute on function public.can_read_automotive_work_order_media_object(text) to authenticated;

comment on function public.can_read_automotive_work_order_media_object(text) is
  'Leitura de mídia da OS exige metadado correspondente. Um objeto órfão no bucket '
  'fica ilegível, mesmo com o arquivo presente.';

-- NOTA — a política de UPDATE em storage.objects continua ausente, e é intencional.
-- A migration 20260824000700 a dropou sem recriar. O cliente sobe arquivo com
-- `upsert: false`, então não precisa de UPDATE, e mantê-la fora é mais restritivo.
-- Se o upload retomável entrar algum dia, ela volta junto — com a mesma checagem de
-- caminho de `can_manage_automotive_work_order_media_object`.
--
-- PENDENTE — limpeza de órfãos. Este achado tem duas metades: tornar o órfão inerte
-- (feito aqui) e removê-lo do bucket (uma rotina periódica, Etapa 9, quando existir
-- execução server-side).
