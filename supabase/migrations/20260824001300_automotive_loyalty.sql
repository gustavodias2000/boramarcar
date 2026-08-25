-- Loyalty is opt-in per Automotive tenant. Points are earned only when an
-- order is delivered after a program has been activated, never retroactively.

create type public.automotive_loyalty_entry_kind as enum (
  'earned',
  'redeemed',
  'adjustment'
);

create table public.automotive_loyalty_programs (
  tenant_id uuid primary key references public.businesses (id) on delete cascade,
  active boolean not null default false,
  points_per_delivered_order integer not null default 1,
  reward_target_points integer not null default 5,
  reward_description text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automotive_loyalty_programs_points_positive
    check (points_per_delivered_order between 1 and 1000),
  constraint automotive_loyalty_programs_target_positive
    check (reward_target_points between 1 and 100000),
  constraint automotive_loyalty_programs_reward_when_active
    check (
      not active
      or char_length(trim(coalesce(reward_description, ''))) between 3 and 240
    )
);

create table public.automotive_loyalty_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  work_order_id uuid,
  kind public.automotive_loyalty_entry_kind not null,
  points integer not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, work_order_id, kind),
  constraint automotive_loyalty_entries_points_nonzero check (points <> 0),
  constraint automotive_loyalty_entries_note_length check (
    note is null or char_length(trim(note)) between 1 and 240
  ),
  constraint automotive_loyalty_entries_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete restrict,
  constraint automotive_loyalty_entries_work_order_belongs_to_tenant
    foreign key (work_order_id, tenant_id)
    references public.automotive_work_orders (id, tenant_id)
    on delete restrict,
  constraint automotive_loyalty_entries_kind_points_direction check (
    (kind = 'earned' and points > 0)
    or (kind in ('redeemed', 'adjustment'))
  ),
  constraint automotive_loyalty_entries_earned_requires_work_order check (
    kind <> 'earned' or work_order_id is not null
  )
);

create index automotive_loyalty_entries_customer_idx
  on public.automotive_loyalty_entries (tenant_id, customer_id, created_at desc);

create trigger automotive_loyalty_programs_set_updated_at
before update on public.automotive_loyalty_programs
for each row execute procedure public.set_updated_at();

create or replace function public.save_automotive_loyalty_program(
  p_tenant_id uuid,
  p_active boolean,
  p_points_per_delivered_order integer,
  p_reward_target_points integer,
  p_reward_description text default null
)
returns public.automotive_loyalty_programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.automotive_loyalty_programs;
  v_description text := nullif(trim(coalesce(p_reward_description, '')), '');
begin
  if not public.is_tenant_administrator(p_tenant_id) then
    raise exception 'Only an administrator can configure Automotive loyalty' using errcode = '42501';
  end if;

  perform public.assert_automotive_business(p_tenant_id);

  if p_points_per_delivered_order not between 1 and 1000 then
    raise exception 'Points per delivered order must be between 1 and 1000' using errcode = '22023';
  end if;

  if p_reward_target_points not between 1 and 100000 then
    raise exception 'Reward target must be between 1 and 100000' using errcode = '22023';
  end if;

  if p_active and (v_description is null or char_length(v_description) not between 3 and 240) then
    raise exception 'An active loyalty program needs a reward description' using errcode = '22023';
  end if;

  insert into public.automotive_loyalty_programs (
    tenant_id,
    active,
    points_per_delivered_order,
    reward_target_points,
    reward_description,
    created_by,
    updated_by
  )
  values (
    p_tenant_id,
    p_active,
    p_points_per_delivered_order,
    p_reward_target_points,
    v_description,
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (tenant_id) do update
  set active = excluded.active,
      points_per_delivered_order = excluded.points_per_delivered_order,
      reward_target_points = excluded.reward_target_points,
      reward_description = excluded.reward_description,
      updated_by = (select auth.uid())
  returning * into v_program;

  return v_program;
end;
$$;

create or replace function public.record_automotive_loyalty_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.automotive_loyalty_programs;
begin
  if new.status <> 'delivered' or old.status = 'delivered' then
    return new;
  end if;

  select *
  into v_program
  from public.automotive_loyalty_programs program
  where program.tenant_id = new.tenant_id
    and program.active
  for key share;

  if found then
    insert into public.automotive_loyalty_entries (
      tenant_id,
      customer_id,
      work_order_id,
      kind,
      points,
      note,
      created_by
    )
    values (
      new.tenant_id,
      new.customer_id,
      new.id,
      'earned',
      v_program.points_per_delivered_order,
      'Crédito por OS entregue',
      (select auth.uid())
    )
    on conflict (tenant_id, work_order_id, kind) do nothing;
  end if;

  return new;
end;
$$;

create trigger automotive_work_orders_loyalty_on_delivery
after update of status on public.automotive_work_orders
for each row execute procedure public.record_automotive_loyalty_on_delivery();

create or replace function public.redeem_automotive_loyalty_reward(
  p_tenant_id uuid,
  p_customer_id uuid,
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_customer_id::text, 0)
  );

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
    created_by
  )
  values (
    p_tenant_id,
    p_customer_id,
    'redeemed',
    -v_program.reward_target_points,
    coalesce(v_note, v_program.reward_description),
    (select auth.uid())
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.save_automotive_loyalty_program(uuid, boolean, integer, integer, text) from public;
revoke all on function public.record_automotive_loyalty_on_delivery() from public;
revoke all on function public.redeem_automotive_loyalty_reward(uuid, uuid, text) from public;

grant execute on function public.save_automotive_loyalty_program(uuid, boolean, integer, integer, text) to authenticated;
grant execute on function public.redeem_automotive_loyalty_reward(uuid, uuid, text) to authenticated;

alter table public.automotive_loyalty_programs enable row level security;
alter table public.automotive_loyalty_entries enable row level security;

revoke all on public.automotive_loyalty_programs from anon, authenticated;
revoke all on public.automotive_loyalty_entries from anon, authenticated;
grant select on public.automotive_loyalty_programs to authenticated;
grant select on public.automotive_loyalty_entries to authenticated;

create policy automotive_loyalty_programs_select_member
on public.automotive_loyalty_programs for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy automotive_loyalty_entries_select_member
on public.automotive_loyalty_entries for select to authenticated
using (public.is_active_business_member(tenant_id));
