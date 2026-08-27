-- Correção: o livro financeiro está ilegível pela API.
--
-- `20260825000200_harden_privileges.sql:24-26` estabeleceu a regra, com estas palavras:
--
--   "Expressão de política é avaliada com o privilégio de quem consulta, então sem
--    EXECUTE nelas toda consulta falharia."
--
-- E o mesmo comentário (`:28-31`) listou `is_tenant_finance_operator` entre as funções
-- que NÃO precisavam de EXECUTE, porque naquele momento ela só era chamada de dentro
-- de funções SECURITY DEFINER, que rodam como o dono. Era verdade.
--
-- `20260825001700_core_finance.sql:169-175` deixou de ser verdade: criou duas políticas
-- de RLS que a chamam diretamente.
--
--   create policy cash_sessions_select_finance  ... using (is_tenant_finance_operator(tenant_id));
--   create policy finance_entries_select_finance ... using (is_tenant_finance_operator(tenant_id));
--
-- SECURITY DEFINER decide com que privilégio o CORPO roda; não dispensa quem CHAMA de
-- ter EXECUTE. Como a expressão de política é avaliada com o privilégio de quem
-- consulta, todo `select` nessas duas tabelas falha com 42501 — inclusive para o
-- proprietário. O caixa, o livro único, a comissão e o espelhamento do pagamento da OS
-- ficaram inalcançáveis no mesmo commit que os entregou.
--
-- O teste `98_core_finance.sql` afirma o comportamento correto (`is_empty` /
-- `isnt_empty`, não `throws_ok`), então a suíte acusa isto assim que rodar.

grant execute on function public.is_tenant_finance_operator(uuid) to authenticated;

comment on function public.is_tenant_finance_operator(uuid) is
  'Papéis com motivo de ver dinheiro: proprietário, gerência, recepção e caixa. '
  'Chamada DENTRO de políticas RLS desde a 20260825001700 — por isso `authenticated` '
  'precisa de EXECUTE, como as demais auxiliares de política.';
