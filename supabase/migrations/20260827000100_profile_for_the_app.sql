-- `profiles` ganha o que o `Usuario` do Barbershop guardava.
--
-- O aplicativo trouxe um `UsuarioRepository` que lê e escreve a coleção `usuarios` do
-- Firestore. O destino dela aqui é `public.profiles`, que nasceu magra — `display_name`
-- e `avatar_url` — porque o site nunca precisou de mais.
--
-- Estes campos não são invenção: são exatamente os que o `Usuario` do Barbershop tem
-- (`apps/mobile/src/types.ts`). O que NÃO veio: `email`, que já vive em `auth.users` e
-- duplicar seria manter duas verdades sobre o mesmo dado.

-- ---------------------------------------------------------------------------
-- Cliente ou empresário
-- ---------------------------------------------------------------------------
-- É a bifurcação do fluxo, e precisa ser PERSISTIDA: sem isto o aplicativo pergunta a
-- cada abertura, e a tela de escolha vira pedágio em vez de decisão.
--
-- Nulo é estado legítimo e significa "ainda não escolheu" — é o que leva a pessoa à
-- tela de perfil logo depois do primeiro login.

create type public.account_type as enum ('customer', 'owner');

alter table public.profiles
  add column account_type public.account_type,

  /** Telefone de quem usa o sistema. Diferente do telefone do CLIENTE, que é dado
      pessoal de terceiro e mora em `customer_contacts`, sob política mais restrita. */
  add column phone text,

  /** "Barbeiro especialista em degradê", "Personal de musculação". Texto livre que a
      pessoa escreve sobre si — no Barbershop é `especialidade`. */
  add column specialty text,

  -- LGPD do PRÓPRIO USUÁRIO, que é assunto diferente do consentimento do cliente
  -- (`customer_consents`). Aqui é a pessoa consentindo sobre os próprios dados.
  --
  -- Os dois seguem o princípio do Barbershop, e por isso são NULÁVEIS sem default:
  -- ausente significa opt-in pendente, nunca autorização implícita. Um `default false`
  -- pareceria inofensivo e apagaria a diferença entre "recusou" e "nunca foi
  -- perguntado" — que é justamente o que uma auditoria quer distinguir.
  add column lgpd_consent boolean,
  add column lgpd_consent_at timestamptz,

  /** Notificação não transacional. Independe da permissão do sistema operacional e do
      token: os três precisam estar ativos para uma campanha entregar. */
  add column push_consent boolean,
  add column push_consent_at timestamptz,

  add constraint profiles_phone_length check (
    phone is null or char_length(trim(phone)) between 8 and 20
  ),
  add constraint profiles_specialty_length check (
    specialty is null or char_length(trim(specialty)) between 1 and 160
  ),
  -- O carimbo existe se e somente se houve escolha. Sem isto dá para ter data de
  -- consentimento sem consentimento, que é pior que não ter nenhum dos dois.
  add constraint profiles_lgpd_consent_complete check (
    (lgpd_consent is null) = (lgpd_consent_at is null)
  ),
  add constraint profiles_push_consent_complete check (
    (push_consent is null) = (push_consent_at is null)
  );

-- ---------------------------------------------------------------------------
-- O carimbo é responsabilidade do banco, nunca da tela
-- ---------------------------------------------------------------------------
-- Vem direto do Barbershop, e a regra é boa o bastante para virar gatilho: a tela informa
-- a ESCOLHA, o instante é gravado aqui. Uma trilha de consentimento em que o cliente
-- escolhe o próprio horário não serve de trilha.

create or replace function public.stamp_profile_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lgpd_consent is distinct from old.lgpd_consent then
    new.lgpd_consent_at := case when new.lgpd_consent is null then null else now() end;
  end if;

  if new.push_consent is distinct from old.push_consent then
    new.push_consent_at := case when new.push_consent is null then null else now() end;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_stamp_consent on public.profiles;

create trigger profiles_stamp_consent
before update on public.profiles
for each row
execute function public.stamp_profile_consent();

-- Na criação o gatilho de UPDATE não roda, então o carimbo inicial vai aqui.
create or replace function public.stamp_profile_consent_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lgpd_consent is not null then new.lgpd_consent_at := now(); end if;
  if new.push_consent is not null then new.push_consent_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists profiles_stamp_consent_insert on public.profiles;

create trigger profiles_stamp_consent_insert
before insert on public.profiles
for each row
execute function public.stamp_profile_consent_on_insert();

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
-- O carimbo é escrito pelos gatilhos, que são SECURITY DEFINER. Conceder UPDATE nas
-- colunas de data permitiria a alguém gravar consentimento datado de ontem.

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, account_type, phone, specialty, lgpd_consent, push_consent)
  on public.profiles to authenticated;

revoke all on function public.stamp_profile_consent() from public, anon, authenticated;
revoke all on function public.stamp_profile_consent_on_insert() from public, anon, authenticated;

comment on column public.profiles.account_type is
  'Cliente ou empresário — a bifurcação logo após o login. NULO significa "ainda não '
  'escolheu", e é o que leva a pessoa à tela de escolha.';
