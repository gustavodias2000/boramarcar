-- A browser retry must not consume a second reward. The client keeps one UUID
-- for the attempt and the ledger stores it as the immutable redemption key.

alter table public.automotive_loyalty_entries
  add column redemption_key uuid;

alter table public.automotive_loyalty_entries
  add constraint automotive_loyalty_entries_redemption_key_only_for_redemption
  check (redemption_key is null or kind = 'redeemed');

create unique index automotive_loyalty_entries_redemption_key_idx
  on public.automotive_loyalty_entries (tenant_id, redemption_key)
  where redemption_key is not null;

drop function public.redeem_automotive_loyalty_reward(uuid, uuid, text);

create function public.redeem_automotive_loyalty_reward(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_redemption_key uuid,
  p_note text default null
)
returns public.automotive_loyalty_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.automotive_loyalty_programs;
  v_entry public.automotive_loyalty_entries;
  v_balance integer;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_tenant_scheduler(p_tenant_id) then
    raise exception 'Only a scheduler can redeem an Automotive loyalty reward' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if p_redemption_key is null then
    raise exception 'A redemption key is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_customer_id::text, 0)
  );

  select *
  into v_entry
  from public.automotive_loyalty_entries entry
  where entry.tenant_id = p_tenant_id
    and entry.redemption_key = p_redemption_key;

  if found then
    if v_entry.customer_id <> p_customer_id then
      raise exception 'The redemption key is already associated with another customer' using errcode = '22023';
    end if;
    return v_entry;
  end if;

  select *
  into v_program
  from public.automotive_loyalty_programs program
  where program.tenant_id = p_tenant_id
    and program.active
  for key share;

  if not found then
    raise exception 'No active Automotive loyalty program for this tenant' using errcode = 'P0001';
  end if;

  perform 1
  from public.customers customer
  where customer.id = p_customer_id
    and customer.tenant_id = p_tenant_id
    and customer.active;

  if not found then
    raise exception 'Active customer not found in this business' using errcode = 'P0001';
  end if;

  select coalesce(sum(entry.points), 0)
  into v_balance
  from public.automotive_loyalty_entries entry
  where entry.tenant_id = p_tenant_id
    and entry.customer_id = p_customer_id;

  if v_balance < v_program.reward_target_points then
    raise exception 'Customer does not have enough loyalty points' using errcode = '22023';
  end if;

  insert into public.automotive_loyalty_entries (
    tenant_id,
    customer_id,
    kind,
    points,
    note,
    redemption_key,
    created_by
  )
  values (
    p_tenant_id,
    p_customer_id,
    'redeemed',
    -v_program.reward_target_points,
    coalesce(v_note, v_program.reward_description),
    p_redemption_key,
    (select auth.uid())
  )
  on conflict (tenant_id, redemption_key) where redemption_key is not null do nothing
  returning * into v_entry;

  if not found then
    select *
    into v_entry
    from public.automotive_loyalty_entries entry
    where entry.tenant_id = p_tenant_id
      and entry.redemption_key = p_redemption_key;

    if v_entry.customer_id <> p_customer_id then
      raise exception 'The redemption key is already associated with another customer' using errcode = '22023';
    end if;
  end if;

  return v_entry;
end;
$$;

revoke all on function public.redeem_automotive_loyalty_reward(uuid, uuid, uuid, text) from public;
grant execute on function public.redeem_automotive_loyalty_reward(uuid, uuid, uuid, text) to authenticated;
