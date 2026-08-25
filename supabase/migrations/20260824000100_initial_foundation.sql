-- Bora Marcar — foundation for a multi-tenant, multi-segment SaaS.
-- This migration intentionally contains only the shared core. Segment-specific
-- records (for example, automotive vehicles and work orders) belong in later
-- module migrations.

create extension if not exists pgcrypto;

create type public.business_type as enum (
  'barbershop',
  'automotive_aesthetics',
  'beauty_salon',
  'manicure',
  'massage',
  'tattoo',
  'eyebrows',
  'aesthetics',
  'depilation',
  'petshop'
);

create type public.business_role as enum (
  'owner',
  'manager',
  'receptionist',
  'professional',
  'cashier'
);

create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(trim(display_name)) between 1 and 120
  )
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type public.business_type not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_name_length check (char_length(trim(name)) between 2 and 160)
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null,
  active boolean not null default true,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  cpf_cnpj text,
  phone text,
  whatsapp text,
  email text,
  birthday date,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint customers_name_length check (char_length(trim(name)) between 1 and 160)
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  business_member_id uuid,
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint professionals_name_length check (char_length(trim(name)) between 1 and 160),
  constraint professionals_member_belongs_to_tenant
    foreign key (business_member_id, tenant_id)
    references public.business_members (id, tenant_id)
    on delete restrict
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null,
  base_price numeric(12, 2) not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  constraint services_name_length check (char_length(trim(name)) between 1 and 160),
  constraint services_duration_positive check (duration_minutes > 0),
  constraint services_price_nonnegative check (base_price >= 0)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  professional_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_valid_period check (end_at > start_at),
  constraint appointments_customer_belongs_to_tenant
    foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
    on delete restrict,
  constraint appointments_service_belongs_to_tenant
    foreign key (service_id, tenant_id)
    references public.services (id, tenant_id)
    on delete restrict,
  constraint appointments_professional_belongs_to_tenant
    foreign key (professional_id, tenant_id)
    references public.professionals (id, tenant_id)
    on delete restrict
);

create index business_members_user_tenant_idx
  on public.business_members (user_id, tenant_id)
  where active;

create index customers_tenant_name_idx
  on public.customers (tenant_id, lower(name));

create index professionals_tenant_name_idx
  on public.professionals (tenant_id, lower(name))
  where active;

create index services_tenant_name_idx
  on public.services (tenant_id, lower(name))
  where active;

create index appointments_tenant_start_idx
  on public.appointments (tenant_id, start_at);

create index appointments_professional_start_idx
  on public.appointments (professional_id, start_at)
  where professional_id is not null and status in ('scheduled', 'confirmed', 'in_progress');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute procedure public.set_updated_at();

create trigger business_members_set_updated_at
before update on public.business_members
for each row execute procedure public.set_updated_at();

create trigger customers_set_updated_at
before update on public.customers
for each row execute procedure public.set_updated_at();

create trigger professionals_set_updated_at
before update on public.professionals
for each row execute procedure public.set_updated_at();

create trigger services_set_updated_at
before update on public.services
for each row execute procedure public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute procedure public.set_updated_at();

-- This trigger keeps application profile data separate from auth.users and
-- avoids ever storing credentials in public tables.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- SECURITY DEFINER helpers prevent recursive RLS checks on business_members.
-- They accept no caller-controlled SQL and deliberately use an empty search path.
create or replace function public.is_active_business_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = (select auth.uid())
      and member.active
  );
$$;

create or replace function public.is_tenant_owner(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'owner'
      and member.active
  );
$$;

create or replace function public.is_tenant_administrator(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'manager')
      and member.active
  );
$$;

create or replace function public.can_claim_initial_tenant_owner(
  target_tenant_id uuid,
  proposed_user_id uuid,
  proposed_role public.business_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select proposed_user_id = (select auth.uid())
    and proposed_role = 'owner'
    and exists (
      select 1
      from public.businesses business
      where business.id = target_tenant_id
        and business.created_by = (select auth.uid())
    )
    and not exists (
      select 1
      from public.business_members member
      where member.tenant_id = target_tenant_id
    );
$$;

revoke all on function public.is_active_business_member(uuid) from public;
revoke all on function public.is_tenant_owner(uuid) from public;
revoke all on function public.is_tenant_administrator(uuid) from public;
revoke all on function public.can_claim_initial_tenant_owner(uuid, uuid, public.business_role) from public;

grant execute on function public.is_active_business_member(uuid) to authenticated;
grant execute on function public.is_tenant_owner(uuid) to authenticated;
grant execute on function public.is_tenant_administrator(uuid) to authenticated;
grant execute on function public.can_claim_initial_tenant_owner(uuid, uuid, public.business_role) to authenticated;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.professionals enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;

create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- A creator can read a business only until the first owner membership is
-- inserted; afterwards membership is the sole normal access path.
create policy businesses_select_member_or_creator
on public.businesses for select to authenticated
using (
  public.is_active_business_member(id)
  or created_by = (select auth.uid())
);

create policy businesses_insert_creator_only
on public.businesses for insert to authenticated
with check (created_by = (select auth.uid()));

create policy businesses_update_administrator
on public.businesses for update to authenticated
using (public.is_tenant_administrator(id))
with check (public.is_tenant_administrator(id));

create policy businesses_delete_owner
on public.businesses for delete to authenticated
using (public.is_tenant_owner(id));

create policy business_members_select_same_tenant
on public.business_members for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy business_members_insert_owner_only
on public.business_members for insert to authenticated
with check (
  public.is_tenant_owner(tenant_id)
  or public.can_claim_initial_tenant_owner(tenant_id, user_id, role)
);

create policy business_members_update_owner_only
on public.business_members for update to authenticated
using (public.is_tenant_owner(tenant_id))
with check (public.is_tenant_owner(tenant_id));

create policy business_members_delete_owner_only
on public.business_members for delete to authenticated
using (public.is_tenant_owner(tenant_id));

create policy customers_select_member
on public.customers for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy customers_insert_operational_roles
on public.customers for insert to authenticated
with check (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = customers.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
);

create policy customers_update_operational_roles
on public.customers for update to authenticated
using (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = customers.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
)
with check (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = customers.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
);

create policy customers_delete_administrator
on public.customers for delete to authenticated
using (public.is_tenant_administrator(tenant_id));

create policy professionals_select_member
on public.professionals for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy professionals_manage_administrator
on public.professionals for all to authenticated
using (public.is_tenant_administrator(tenant_id))
with check (public.is_tenant_administrator(tenant_id));

create policy services_select_member
on public.services for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy services_manage_administrator
on public.services for all to authenticated
using (public.is_tenant_administrator(tenant_id))
with check (public.is_tenant_administrator(tenant_id));

create policy appointments_select_member
on public.appointments for select to authenticated
using (public.is_active_business_member(tenant_id));

create policy appointments_insert_operational_roles
on public.appointments for insert to authenticated
with check (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = appointments.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
);

create policy appointments_update_operational_roles
on public.appointments for update to authenticated
using (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = appointments.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
)
with check (
  public.is_tenant_administrator(tenant_id)
  or exists (
    select 1
    from public.business_members member
    where member.tenant_id = appointments.tenant_id
      and member.user_id = (select auth.uid())
      and member.role = 'receptionist'
      and member.active
  )
);

create policy appointments_delete_administrator
on public.appointments for delete to authenticated
using (public.is_tenant_administrator(tenant_id));
