-- Etapa 1 — impedir que a empresa fique sem proprietário (achado C-20).
--
-- `business_members_delete_owner_only` permite ao owner remover a si mesmo, e o
-- update de papel permite rebaixar-se. Depois disso ninguém administra a empresa:
-- `can_claim_initial_tenant_owner` exige que NÃO exista nenhum membro para alguém
-- reivindicar a posse, então sobrando um manager a empresa fica órfã para sempre.
--
-- DECISÕES DE DESENHO
--
-- 1. Gatilho de CONSTRAINT, DEFERRABLE INITIALLY DEFERRED: a verificação acontece
--    no commit, não a cada linha. Assim a troca de dono numa única transação
--    funciona em qualquer ordem — promover o novo e rebaixar o antigo.
--
-- 2. SECURITY DEFINER: a checagem precisa enxergar a tabela inteira. Sob RLS, um
--    owner que acabou de se remover deixaria de ver os próprios colegas e a função
--    acusaria falta de dono onde ainda existe um.
--
-- 3. Sai calado quando a empresa não existe mais: durante o cascade de exclusão da
--    empresa não há invariante a preservar.
--
-- Não é concedido EXECUTE a ninguém: função de gatilho não é chamada diretamente.

create or replace function public.enforce_last_business_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A empresa está sendo excluída: o cascade leva os membros junto.
  if not exists (
    select 1
    from public.businesses business
    where business.id = old.tenant_id
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.business_members member
    where member.tenant_id = old.tenant_id
      and member.role = 'owner'
      and member.active
  ) then
    raise exception 'A empresa precisa manter ao menos um proprietário ativo'
      using errcode = '22023';
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_last_business_owner() from public, anon, authenticated;

drop trigger if exists business_members_keep_last_owner on public.business_members;

create constraint trigger business_members_keep_last_owner
after update or delete on public.business_members
deferrable initially deferred
for each row
execute function public.enforce_last_business_owner();

comment on function public.enforce_last_business_owner() is
  'Garante que toda empresa mantenha ao menos um proprietário ativo. Verificado no '
  'commit, para permitir a troca de dono numa única transação.';
