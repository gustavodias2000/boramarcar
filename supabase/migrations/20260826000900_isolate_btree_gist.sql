-- `btree_gist` sai do schema `public`.
--
-- A CAUSA, encontrada pelo CI: `20260824000200_scheduling_resources_and_reservations.sql:4`
-- faz `create extension if not exists btree_gist;` sem cláusula de schema, e o padrão é
-- o primeiro schema do `search_path` — `public`. A extensão despeja ali **centenas** de
-- funções: `gbt_uuid_penalty`, `gbt_ts_consistent`, `cash_dist`, `gbt_int4_distance` e
-- companhia.
--
-- Duas asserções do `00_privilege_snapshot.sql` quebraram por causa disso, e as duas
-- estavam CERTAS:
--
--   "anon cannot execute any function in public"  — porque `PUBLIC` recebe EXECUTE nas
--   funções de uma extensão por padrão, e `anon` herda de `PUBLIC`;
--   "exactly the intended RPCs are executable by authenticated" — pelo mesmo motivo.
--
-- A correção ERRADA seria acrescentar essas centenas de funções à lista fechada, ou
-- conceder/revogar em massa. A lista fechada existe justamente para doer quando algo
-- novo fica alcançável; enchê-la de ruído a mataria. A correção certa é a extensão não
-- morar em `public`.
--
-- POR QUE MIGRATION NOVA, E NÃO EDITAR A ORIGINAL
--
-- A 20260824000200 já foi publicada e aplicada. Editá-la deixaria o banco remoto (que
-- não reaplica migration já registrada) divergente do CI (que aplica do zero). A regra
-- do projeto é criar uma nova, e ela vale exatamente para este caso.
--
-- POR QUE ISTO NÃO QUEBRA A CONSTRAINT DE EXCLUSÃO
--
-- `scheduling_resource_reservations_no_overlap` é `exclude using gist (... with =, ...
-- with &&)`. O `&&` de `tstzrange` é de `pg_catalog`, não da extensão. O que vem do
-- `btree_gist` é a classe de operadores que permite `uuid with =` num índice GiST — e
-- ela já foi resolvida no momento da criação do índice, que guarda o OID da opclass.
-- `alter extension ... set schema` reescreve o catálogo; índices existentes seguem
-- apontando para os mesmos objetos.
--
-- `btree_gist` é `relocatable = true` no seu arquivo de controle, então o `set schema`
-- é suportado.

create schema if not exists extensions;

-- `if exists` porque num banco onde a extensão já nasceu em `extensions` — instalação
-- Supabase mais nova, por exemplo — não há o que mover.
do $$
begin
  if exists (
    select 1
    from pg_extension extension
    join pg_namespace espaco on espaco.oid = extension.extnamespace
    where extension.extname = 'btree_gist' and espaco.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end;
$$;

-- Quem consulta precisa enxergar o schema para resolver operador em DDL futura. Não é
-- concessão de dado: `extensions` não guarda tabela nenhuma.
grant usage on schema extensions to anon, authenticated, service_role;

comment on schema extensions is
  'Extensões do PostgreSQL, fora do `public` de propósito. Uma extensão instalada em '
  '`public` publica centenas de funções que `PUBLIC` pode executar, e isso derruba a '
  'lista fechada de RPCs do `00_privilege_snapshot.sql` — que é a guarda mais valiosa '
  'da suíte. Extensão nova entra AQUI: `create extension ... with schema extensions`.';
