-- O código de convite do próprio profissional, criado sob demanda.
--
-- Substitui a Cloud Function `garantirConvite` do Barbershop, que a tela de QR Code
-- chama para mostrar o código que o profissional espalha — no cartão, no espelho da
-- cadeira, no story.
--
-- POR QUE FUNÇÃO E NÃO INSERT DIRETO
--
-- A política já permitiria a quem agenda inserir em `business_invitations`. Mas o código
-- é ÚNICO GLOBALMENTE — `unique (code)` sem filtro de tenant, porque quem resgata não
-- sabe de qual empresa é o convite. Gerar valor único a partir do cliente significa
-- gerar, tentar, colidir, tentar de novo, com a corrida entre duas telas acontecendo no
-- meio. Aqui a repetição acontece dentro da transação e a colisão é resolvida onde ela é
-- detectada.
--
-- O CÓDIGO NÃO PODE PARECER PALAVRA. O alfabeto exclui `I`, `O`, `0` e `1`: quem lê o
-- código de um cartão ou de um espelho confunde os quatro, e um convite que não resgata
-- na primeira tentativa vira chamado de suporte. É o mesmo motivo de os códigos de
-- confirmação de banco fazerem isso.
--
-- IDEMPOTENTE POR DESENHO, como o `redeem_business_invitation`: chamar de novo devolve o
-- mesmo convite em vez de criar um segundo. Um profissional com dois códigos ativos é um
-- profissional cujo cartão impresso deixou de valer.

create or replace function public.ensure_invitation_code(
  p_tenant_id uuid,
  p_professional_id uuid default null
)
returns public.business_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.business_invitations;
  v_codigo text;
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tentativa integer;
  v_posicao integer;
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can create an invitation' using errcode = '42501';
  end if;

  if p_professional_id is not null and not exists (
    select 1
    from public.professionals professional
    where professional.id = p_professional_id
      and professional.tenant_id = p_tenant_id
      and professional.active
  ) then
    raise exception 'Profissional não encontrado nesta empresa' using errcode = 'P0001';
  end if;

  -- Já existe um ativo? Devolve ele. É o determinismo que preserva cartão impresso.
  select *
  into v_convite
  from public.business_invitations convite
  where convite.tenant_id = p_tenant_id
    and convite.professional_id is not distinct from p_professional_id
    and convite.active
    and (convite.expires_at is null or convite.expires_at > now())
  order by convite.created_at
  limit 1;

  if found then
    return v_convite;
  end if;

  -- Oito caracteres do alfabeto reduzido dão mais de um trilhão de combinações. Dez
  -- tentativas é folga larga sobre qualquer volume que este produto vá ter, e o limite
  -- existe para a função falhar alto em vez de girar para sempre se algo estiver errado.
  for v_tentativa in 1..10 loop
    v_codigo := '';

    for v_posicao in 1..8 loop
      v_codigo := v_codigo ||
        substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::integer, 1);
    end loop;

    begin
      insert into public.business_invitations (tenant_id, code, professional_id, created_by)
      values (p_tenant_id, v_codigo, p_professional_id, (select auth.uid()))
      returning * into v_convite;

      return v_convite;
    exception
      when unique_violation then
        -- Colidiu com um código existente. Tenta outro.
        null;
    end;
  end loop;

  raise exception 'Não foi possível gerar um código de convite. Tente novamente.'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.ensure_invitation_code(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_invitation_code(uuid, uuid) to authenticated;

comment on function public.ensure_invitation_code(uuid, uuid) is
  'Devolve o convite ativo da empresa ou do profissional, criando um se não houver. '
  'Idempotente de propósito: dois códigos ativos para o mesmo profissional invalidariam '
  'o cartão que ele já imprimiu. O alfabeto exclui I, O, 0 e 1 porque quem digita o '
  'código de um cartão confunde os quatro.';
