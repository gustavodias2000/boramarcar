-- Privilege snapshot.
--
-- This is the highest-leverage file in the suite. It does two jobs:
--
--   1. GUARD — any function or table added later that is reachable by `anon` or
--      `authenticated` without being deliberately added to the list below fails CI.
--      A new RPC is born un-exposed and has to be consciously opened.
--
--   2. MEASUREMENT — the audit predicted (C-1, C-3) that `revoke ... from public`
--      never removed Supabase's default grants to `anon`/`authenticated`. That was
--      inferred from the code, never observed. These assertions settle it.
--
-- The todo_start/todo_end wrappers were removed by Etapa 1
-- (migration 20260825000200_harden_privileges.sql), which revoked the default grants
-- and re-granted exactly the list below. Every assertion here is now binding: the
-- build fails if the surface reopens.

begin;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- anon must reach nothing at all
-- ---------------------------------------------------------------------------
-- No customer-facing surface exists yet (Etapa 10). Until then `anon` has no
-- legitimate reason to touch any object in `public`.

select is_empty(
  $$
    select c.relname::text, p.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER')
    ) as p(priv)
    where n.nspname = 'public'
      and c.relkind in ('r','v','m','p')
      and has_table_privilege('anon', c.oid, p.priv)
  $$,
  'anon has no table privilege anywhere in public'
);

select is_empty(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon cannot execute any function in public'
);

-- ---------------------------------------------------------------------------
-- authenticated must never hold a destructive privilege
-- ---------------------------------------------------------------------------
-- TRUNCATE is the one that matters most: it is NOT filtered by RLS, so a single
-- default grant turns tenant isolation into cross-tenant data destruction.

select is_empty(
  $$
    select c.relname::text, p.priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) as p(priv)
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and has_table_privilege('authenticated', c.oid, p.priv)
  $$,
  'authenticated holds no destructive table privilege'
);

-- ---------------------------------------------------------------------------
-- The work-order counter must be unreachable
-- ---------------------------------------------------------------------------
-- The table is already correct: RLS on, no policy, no grant. Asserted without a
-- TODO because nothing should ever open it.

select is_empty(
  $$
    select p.priv
    from (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
      ('TRUNCATE'),('REFERENCES'),('TRIGGER')
    ) as p(priv)
    where has_table_privilege('authenticated',
                              'public.automotive_work_order_number_counters', p.priv)
       or has_table_privilege('anon',
                              'public.automotive_work_order_number_counters', p.priv)
  $$,
  'automotive_work_order_number_counters is unreachable through the API'
);

-- ---------------------------------------------------------------------------
-- The closed list of RPCs
-- ---------------------------------------------------------------------------
-- This is the contract. Adding a function to the schema does not add it here;
-- opening it is a deliberate, reviewable edit. Compared by name rather than by
-- signature so an overload replaced in a later migration does not break the test.

select set_eq(
  $$
    select distinct p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  $$ values
      -- authorization helpers the policies call
      ('is_active_business_member'),
      ('is_tenant_owner'),
      ('is_tenant_administrator'),
      ('is_tenant_scheduler'),
      -- Entrou na lista quando `20260825001700_core_finance.sql` passou a chamá-la
      -- dentro de duas políticas de RLS. Antes disso só era usada de dentro de
      -- funções SECURITY DEFINER, e por isso ficava de fora — ver a 20260826000100.
      ('is_tenant_finance_operator'),
      ('is_current_user_professional'),
      ('is_automotive_business'),
      ('can_read_automotive_work_order_media_object'),
      ('can_manage_automotive_work_order_media_object'),
      -- scheduling
      ('create_staff_appointment'),
      ('reschedule_staff_appointment'),
      ('transition_staff_appointment'),
      ('create_scheduling_block'),
      ('remove_scheduling_block'),
      -- automotive operations
      ('create_automotive_box'),
      ('assign_automotive_appointment_box'),
      ('assign_automotive_work_order_box'),
      ('release_automotive_work_order_box'),
      ('open_automotive_work_order'),
      ('open_automotive_walk_in_work_order'),
      ('add_automotive_work_order_item'),
      ('remove_automotive_work_order_item'),
      ('record_automotive_work_order_payment'),
      ('transition_automotive_work_order'),
      ('deliver_automotive_work_order'),
      ('register_automotive_work_order_media'),
      ('remove_automotive_work_order_media'),
      -- núcleo (Etapa 4)
      ('record_appointment_rating'),
      ('generate_recurrence_appointment'),
      ('mark_waitlist_notified'),
      ('schedule_from_waitlist'),
      ('redeem_business_invitation'),
      ('create_business_with_owner'),
      -- financeiro do núcleo (§43)
      ('open_cash_session'),
      ('close_cash_session'),
      ('record_finance_entry'),
      -- ponte Agenda ↔ Pátio (Etapa 6)
      ('assign_automotive_work_order_professional'),
      ('update_automotive_box'),
      ('set_professional_schedule_rule'),
      ('remove_professional_schedule_rule'),
      -- loyalty
      ('save_automotive_loyalty_program'),
      ('redeem_automotive_loyalty_reward'),
      -- LGPD (§48)
      ('upsert_customer_contact'),
      ('clear_customer_contact_fields'),
      ('record_customer_consent'),
      ('anonymize_customer'),
      ('deactivate_professional'),
      ('delete_business'),
      -- endereço da empresa na URL
      ('set_business_slug'),
      -- banimento (BanimentoRepository do Barbershop)
      ('ban_customer'),
      ('unban_customer')
  $$,
  'exactly the intended RPCs are executable by authenticated'
);

-- ---------------------------------------------------------------------------
-- Named call-outs for the two functions the audit flagged individually
-- ---------------------------------------------------------------------------
-- Kept separate from the set comparison above so a failure names the actual risk
-- instead of printing a diff of thirty rows.

-- `slugify` só é chamada de dentro de SECURITY DEFINER. Conceder EXECUTE não quebraria
-- nada e ampliaria a superfície sem motivo.
select ok(
  not has_function_privilege('authenticated', 'public.slugify(text)', 'EXECUTE'),
  'slugify nao e alcancavel pela API'
);

select ok(
  not has_function_privilege('authenticated', 'public.endereco_reservado(text)', 'EXECUTE'),
  'endereco_reservado tambem nao — a interface tem a propria copia'
);

-- Privilegio de COLUNA nao aparece em has_table_privilege(...,'UPDATE'), entao estas
-- duas assertivas sao a unica prova de que o revoke de coluna pegou.
select ok(
  not has_column_privilege('authenticated', 'public.businesses', 'slug', 'UPDATE'),
  'nao se reescreve o endereco da empresa direto — so por set_business_slug'
);

select ok(
  not has_column_privilege('authenticated', 'public.businesses', 'business_type', 'UPDATE'),
  'nao se troca o segmento de um tenant vivo por UPDATE direto'
);

select ok(
  has_column_privilege('authenticated', 'public.businesses', 'name', 'UPDATE'),
  'control — renomear a empresa continua permitido'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.next_automotive_work_order_number(uuid)',
    'EXECUTE'
  ),
  'next_automotive_work_order_number is not callable by authenticated (C-2)'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.require_available_professional_resource(uuid, uuid, timestamptz, timestamptz)',
    'EXECUTE'
  ),
  'require_available_professional_resource is not callable by authenticated'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.assert_automotive_business(uuid)',
    'EXECUTE'
  ),
  'assert_automotive_business is not callable by authenticated'
);

-- ---------------------------------------------------------------------------
-- RLS coverage
-- ---------------------------------------------------------------------------
-- Already true today. Asserted so a new table cannot be added without it.

select is_empty(
  $$
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  $$,
  'every table in public has row level security enabled'
);

select * from finish();
rollback;
