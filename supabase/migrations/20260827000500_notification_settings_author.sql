-- Quem mudou a preferência de aviso.
--
-- `business_notification_settings.updated_by` foi declarada e nunca preenchida: a coluna
-- ficou de fora do `grant update` — de propósito, porque aceitar o autor do cliente HTTP
-- permitiria atribuir a mudança a outra pessoa — e nenhum gatilho a escrevia. Resultado:
-- uma coluna que promete uma trilha e devolve nulo sempre, que é pior que não existir.
--
-- O Barbershop gravava `updatedBy` em toda escrita real, e distinguia isso de "ainda não
-- configurado", onde autor nenhum existe. Aqui a distinção é a mesma: a linha nasce pelo
-- gatilho de seed com `updated_by` nulo, e passa a ter autor no primeiro UPDATE.
--
-- O gatilho é o único caminho possível, e é isso que o torna confiável.

create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by = (select auth.uid());
  return new;
end;
$$;

create trigger business_notification_settings_set_updated_by
before update on public.business_notification_settings
for each row
execute function public.set_updated_by();

-- Função criada depois da Etapa 1 nasce com EXECUTE para `public`, e `authenticated`
-- herda por ali — o `alter default privileges` da Etapa 1 revoga de `anon` e
-- `authenticated` diretamente, não do `public` que os cobre. Sem este revoke, um gatilho
-- interno vira RPC pública e o snapshot de privilégios falha, com razão.
revoke all on function public.set_updated_by() from public, anon, authenticated;

comment on function public.set_updated_by() is
  'Carimba o autor de um UPDATE a partir de auth.uid(). Existe como gatilho, e nao como '
  'coluna concedida, porque autor vindo do cliente HTTP e autor forjavel.';
