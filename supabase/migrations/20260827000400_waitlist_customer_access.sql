-- A porta do cliente na lista de espera.
--
-- O QUE ESTAVA FALTANDO
--
-- `appointment_waitlist` nasceu com duas políticas, e as duas são da equipe: membro
-- ativo lê, agendador escreve. Mas no Barbershop quem entra na fila é o CLIENTE, da
-- `AgendamentoScreen`, quando o dia escolhido não tem horário — não é a recepção que
-- anota, é a pessoa que ficou sem vaga e pediu para ser avisada.
--
-- Portada como estava, `entrarNaFila` seria negada em toda chamada: o cliente final não
-- é membro da empresa, e RLS em INSERT levanta 42501. A fila existiria e ninguém
-- conseguiria entrar nela.
--
-- COMO ISTO ABRE SEM AFROUXAR
--
-- Não há GRANT novo de tabela nem política permissiva. A porta é uma função
-- `security definer` com a autorização escrita dentro: só quem TEM VÍNCULO ATIVO com
-- aquela empresa entra na fila, e só em nome de si mesmo — o `customer_id` não vem do
-- parâmetro, vem do vínculo. É o mesmo desenho de `redeem_business_invitation`, pelo
-- mesmo motivo: o cliente é autenticado e não tem nenhuma permissão sobre o tenant.
--
-- A política de leitura acrescentada é igualmente estreita, e segue a que
-- `customer_links` já abriu ("a equipe vê os da empresa; o cliente vê o próprio").

-- ---------------------------------------------------------------------------
-- Quem sou eu, como cliente, nesta empresa
-- ---------------------------------------------------------------------------
-- A ponte `auth.uid() → customer_links → customers.id`, que faltava como função.
--
-- `security definer` porque ela é chamada de dentro de política e de funções que o
-- cliente final executa sem enxergar `customer_links` inteiro. E EXECUTE concedido a
-- `authenticated` porque expressão de política roda com o privilégio de QUEM CONSULTA —
-- `security definer` não isenta o chamador de precisar do EXECUTE. Foi exatamente esse
-- esquecimento que deixou o razão financeiro ilegível pela API (F-0).

create or replace function public.current_customer_id(target_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select link.customer_id
  from public.customer_links link
  where link.tenant_id = target_tenant_id
    and link.user_id = (select auth.uid())
    and link.active
  limit 1;
$$;

revoke all on function public.current_customer_id(uuid) from public, anon, authenticated;
grant execute on function public.current_customer_id(uuid) to authenticated;

comment on function public.current_customer_id(uuid) is
  'O cadastro de cliente que corresponde a quem esta logado, naquela empresa. '
  'Nulo quando nao ha vinculo ativo — que e a resposta certa para "nao e cliente daqui".';

-- ---------------------------------------------------------------------------
-- O cliente vê a própria espera
-- ---------------------------------------------------------------------------
-- Sem isto, `jaEstaNaFila` devolveria sempre falso e a tela ofereceria entrar na fila a
-- quem já está nela.

create policy appointment_waitlist_select_self
on public.appointment_waitlist for select to authenticated
using (customer_id = public.current_customer_id(tenant_id));

-- ---------------------------------------------------------------------------
-- Uma pessoa, um lugar na fila
-- ---------------------------------------------------------------------------
-- O Barbershop verificava com uma consulta antes de inserir. Dois toques no botão, ou
-- dois aparelhos, e a pessoa entrava duas vezes — a checagem e a escrita eram chamadas
-- separadas. Aqui a promessa vira índice, e a corrida deixa de existir.
--
-- O recorte inclui `professional_id`: esperar por dois profissionais no mesmo dia é
-- legítimo numa equipe. `nulls not distinct` porque "qualquer profissional serve" é UM
-- lugar na fila, não infinitos — sem isso, cada toque no botão criaria outra linha, que
-- é justamente o que o índice existe para impedir.
--
-- Só vale para quem ainda espera: quem foi agendado ou expirou pode voltar à fila.

create unique index appointment_waitlist_one_spot_per_person_idx
  on public.appointment_waitlist (tenant_id, customer_id, professional_id, desired_date)
  nulls not distinct
  where status in ('waiting', 'notified');

-- ---------------------------------------------------------------------------
-- Entrar na fila
-- ---------------------------------------------------------------------------
-- Idempotente pelo mesmo motivo de `redeem_business_invitation` e de
-- `ensure_invitation_code`: a tela chama de novo depois de um toque duplo ou de uma
-- reconexão, e a segunda chamada tem de devolver o mesmo lugar, não um segundo.

create or replace function public.join_waitlist(
  p_professional_id uuid,
  p_desired_date date,
  p_service_id uuid default null,
  p_notes text default null
)
returns public.appointment_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_customer_id uuid;
  v_entry public.appointment_waitlist;
begin
  select professional.tenant_id
  into v_tenant_id
  from public.professionals professional
  where professional.id = p_professional_id
    and professional.active;

  if not found then
    raise exception 'Profissional não encontrado' using errcode = 'P0001';
  end if;

  -- Quem entra na fila é sempre quem chamou. Aceitar `customer_id` do cliente HTTP
  -- deixaria qualquer pessoa vinculada colocar outra na fila alheia.
  v_customer_id := public.current_customer_id(v_tenant_id);

  if v_customer_id is null then
    raise exception 'Você ainda não é cliente desta empresa.' using errcode = '42501';
  end if;

  if p_service_id is not null and not exists (
    select 1
    from public.services service
    where service.id = p_service_id
      and service.tenant_id = v_tenant_id
      and service.active
  ) then
    raise exception 'Serviço não encontrado nesta empresa' using errcode = 'P0001';
  end if;

  -- A data desejada é lida no fuso da empresa, não no do servidor. Um cliente entrando
  -- na fila às 22h de Brasília para "amanhã" não pode ser recusado porque em UTC já é
  -- o dia seguinte.
  if p_desired_date < public.business_local_date(v_tenant_id, now()) then
    raise exception 'Não é possível entrar na fila para uma data que já passou.'
      using errcode = '22023';
  end if;

  select *
  into v_entry
  from public.appointment_waitlist entry
  where entry.tenant_id = v_tenant_id
    and entry.customer_id = v_customer_id
    and entry.professional_id is not distinct from p_professional_id
    and entry.desired_date = p_desired_date
    and entry.status in ('waiting', 'notified');

  if found then
    return v_entry;
  end if;

  insert into public.appointment_waitlist (
    tenant_id, customer_id, service_id, professional_id, desired_date, notes, created_by
  )
  values (
    v_tenant_id, v_customer_id, p_service_id, p_professional_id, p_desired_date,
    nullif(btrim(coalesce(p_notes, '')), ''), (select auth.uid())
  )
  returning * into v_entry;

  return v_entry;
exception
  -- Duas chamadas simultâneas: o índice barra a segunda, e ela devolve a linha que a
  -- primeira acabou de criar. Sem isto, o toque duplo viraria erro na cara do usuário.
  when unique_violation then
    select *
    into v_entry
    from public.appointment_waitlist entry
    where entry.tenant_id = v_tenant_id
      and entry.customer_id = v_customer_id
      and entry.professional_id is not distinct from p_professional_id
      and entry.desired_date = p_desired_date
      and entry.status in ('waiting', 'notified');

    return v_entry;
end;
$$;

revoke all on function public.join_waitlist(uuid, date, uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(uuid, date, uuid, text) to authenticated;

comment on function public.join_waitlist(uuid, date, uuid, text) is
  'O cliente final entra na propria fila. SECURITY DEFINER porque ele nao e membro da '
  'empresa e a tabela so tem politicas de equipe. O customer_id vem do vinculo ativo, '
  'nunca do parametro — e o que impede colocar outra pessoa na fila.';

-- ---------------------------------------------------------------------------
-- Sair da fila
-- ---------------------------------------------------------------------------
-- Desistir é direito de quem entrou, e a política de escrita é só do agendador. Sem
-- isto, o cliente dependeria da recepção para sair de uma fila em que se colocou
-- sozinho.

create or replace function public.leave_waitlist(p_waitlist_id uuid)
returns public.appointment_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.appointment_waitlist;
begin
  select *
  into v_entry
  from public.appointment_waitlist entry
  where entry.id = p_waitlist_id
  for update;

  if not found then
    raise exception 'Entrada da lista de espera não encontrada' using errcode = 'P0001';
  end if;

  if v_entry.customer_id is distinct from public.current_customer_id(v_entry.tenant_id)
     and not public.is_tenant_scheduler(v_entry.tenant_id) then
    raise exception 'Only the customer or a scheduler can leave the waitlist'
      using errcode = '42501';
  end if;

  if v_entry.status not in ('waiting', 'notified') then
    raise exception 'Esta espera já foi resolvida.' using errcode = '22023';
  end if;

  update public.appointment_waitlist entry
  set status = 'expired',
      resolved_at = now()
  where entry.id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.leave_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.leave_waitlist(uuid) to authenticated;

comment on function public.leave_waitlist(uuid) is
  'Sair da fila. Aceita o proprio cliente ou o agendador — desistir e direito de quem '
  'entrou, e a politica de escrita da tabela e so da equipe.';
