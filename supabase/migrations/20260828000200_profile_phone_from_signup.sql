-- O telefone informado no cadastro passa a chegar no perfil.
--
-- `profiles.phone` existe desde `20260827000100` e nunca era preenchido: o gatilho de
-- criação de conta copiava só nome e avatar do `raw_user_meta_data`. Quem digitava o
-- telefone na tela de cadastro via o campo ser aceito e o dado sumir.
--
-- POR QUE O TELEFONE IMPORTA AQUI. É por ele que o WhatsApp funciona — e WhatsApp é o
-- canal que o Barbershop mais usa: confirmação, lembrete, aviso de vaga na lista de
-- espera, promoção. É também o número que uma confirmação por SMS usaria, se ela vier.
--
-- ISTO NÃO É VERIFICAÇÃO. O número entra como a pessoa digitou, sem confirmar que é
-- dela. Confirmar exige um provedor de SMS contratado no projeto Supabase, com custo por
-- mensagem, e é decisão de produto, não de schema. Guardar o número agora é o que evita
-- pedir de novo depois.
--
-- `on conflict do nothing` continua: recriar o gatilho não pode ressuscitar perfil
-- apagado por exclusão de conta.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    -- `auth.users.phone` vem preenchido quando o cadastro é por telefone; o campo da
    -- tela é o segundo caminho. O primeiro ganha porque é o que o provedor confirmou.
    nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o perfil quando a conta nasce. Copia nome, avatar e telefone do cadastro — o '
  'telefone SEM verificacao, que exigiria provedor de SMS contratado.';
