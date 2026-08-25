-- Private Storage for Automotive work-order photos. Files use the canonical
-- path: {tenant_id}/{work_order_id}/{stage}/{file_uuid}.{extension}.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'automotive-work-order-media',
  'automotive-work-order-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create or replace function public.parse_automotive_work_order_media_path(
  p_storage_path text
)
returns table (
  tenant_id uuid,
  work_order_id uuid,
  stage public.automotive_media_stage
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_matches text[];
begin
  v_matches := regexp_match(
    p_storage_path,
    '^([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/(intake|execution|delivery)/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})[.](jpg|jpeg|png|webp)$'
  );

  if v_matches is null then
    return;
  end if;

  tenant_id := v_matches[1]::uuid;
  work_order_id := v_matches[2]::uuid;
  stage := v_matches[3]::public.automotive_media_stage;
  return next;
end;
$$;

create or replace function public.is_valid_automotive_work_order_media_path(
  p_storage_path text,
  p_tenant_id uuid,
  p_work_order_id uuid,
  p_stage public.automotive_media_stage
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from public.parse_automotive_work_order_media_path(p_storage_path) path
    where path.tenant_id = p_tenant_id
      and path.work_order_id = p_work_order_id
      and path.stage = p_stage
  );
$$;

create or replace function public.can_read_automotive_work_order_media_object(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parse_automotive_work_order_media_path(p_storage_path) path
    join public.automotive_work_orders work_order
      on work_order.id = path.work_order_id
      and work_order.tenant_id = path.tenant_id
    where public.is_active_business_member(path.tenant_id)
  );
$$;

create or replace function public.can_manage_automotive_work_order_media_object(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.parse_automotive_work_order_media_path(p_storage_path) path
    join public.automotive_work_orders work_order
      on work_order.id = path.work_order_id
      and work_order.tenant_id = path.tenant_id
    where public.is_tenant_scheduler(path.tenant_id)
      or (
        work_order.assigned_professional_id is not null
        and public.is_current_user_professional(
          work_order.assigned_professional_id,
          path.tenant_id
        )
      )
  );
$$;

alter table public.automotive_work_order_events
  drop constraint automotive_work_order_events_type;

alter table public.automotive_work_order_events
  add constraint automotive_work_order_events_type check (
    event_type in (
      'created',
      'item_added',
      'item_removed',
      'payment_recorded',
      'stage_changed',
      'box_assigned',
      'box_released',
      'media_added',
      'media_removed',
      'delivered',
      'cancelled'
    )
  );

create or replace function public.register_automotive_work_order_media(
  p_work_order_id uuid,
  p_stage public.automotive_media_stage,
  p_storage_path text,
  p_caption text default null
)
returns public.automotive_work_order_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.automotive_work_orders;
  v_media public.automotive_work_order_media;
begin
  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = p_work_order_id
  for key share;

  if not found then
    raise exception 'Automotive work order not found' using errcode = 'P0001';
  end if;

  if not public.is_tenant_scheduler(v_work_order.tenant_id)
    and not (
      v_work_order.assigned_professional_id is not null
      and public.is_current_user_professional(
        v_work_order.assigned_professional_id,
        v_work_order.tenant_id
      )
    ) then
    raise exception 'You cannot register media for this Automotive work order' using errcode = '42501';
  end if;

  if not public.is_valid_automotive_work_order_media_path(
    p_storage_path,
    v_work_order.tenant_id,
    v_work_order.id,
    p_stage
  ) then
    raise exception 'The media path must match the tenant, work order and stage' using errcode = '22023';
  end if;

  perform 1
  from storage.objects object
  where object.bucket_id = 'automotive-work-order-media'
    and object.name = p_storage_path;

  if not found then
    raise exception 'Uploaded media object not found' using errcode = 'P0001';
  end if;

  insert into public.automotive_work_order_media (
    tenant_id,
    work_order_id,
    stage,
    storage_path,
    caption,
    created_by
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    p_stage,
    p_storage_path,
    nullif(trim(p_caption), ''),
    (select auth.uid())
  )
  returning * into v_media;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_work_order.tenant_id,
    v_work_order.id,
    'media_added',
    (select auth.uid()),
    jsonb_build_object('media_id', v_media.id, 'stage', p_stage)
  );

  return v_media;
end;
$$;

create or replace function public.remove_automotive_work_order_media(
  p_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.automotive_work_order_media;
  v_work_order public.automotive_work_orders;
begin
  select *
  into v_media
  from public.automotive_work_order_media media
  where media.id = p_media_id
  for update;

  if not found then
    raise exception 'Automotive work-order media not found' using errcode = 'P0001';
  end if;

  select *
  into v_work_order
  from public.automotive_work_orders work_order
  where work_order.id = v_media.work_order_id
    and work_order.tenant_id = v_media.tenant_id
  for key share;

  if not public.is_tenant_scheduler(v_media.tenant_id)
    and not (
      v_work_order.assigned_professional_id is not null
      and public.is_current_user_professional(
        v_work_order.assigned_professional_id,
        v_media.tenant_id
      )
    ) then
    raise exception 'You cannot remove media from this Automotive work order' using errcode = '42501';
  end if;

  delete from storage.objects object
  where object.bucket_id = 'automotive-work-order-media'
    and object.name = v_media.storage_path;

  delete from public.automotive_work_order_media
  where id = v_media.id;

  insert into public.automotive_work_order_events (
    tenant_id,
    work_order_id,
    event_type,
    actor_user_id,
    metadata
  )
  values (
    v_media.tenant_id,
    v_media.work_order_id,
    'media_removed',
    (select auth.uid()),
    jsonb_build_object('media_id', v_media.id, 'stage', v_media.stage)
  );
end;
$$;

revoke all on function public.parse_automotive_work_order_media_path(text) from public;
revoke all on function public.is_valid_automotive_work_order_media_path(text, uuid, uuid, public.automotive_media_stage) from public;
revoke all on function public.can_read_automotive_work_order_media_object(text) from public;
revoke all on function public.can_manage_automotive_work_order_media_object(text) from public;
revoke all on function public.register_automotive_work_order_media(uuid, public.automotive_media_stage, text, text) from public;
revoke all on function public.remove_automotive_work_order_media(uuid) from public;

grant execute on function public.can_read_automotive_work_order_media_object(text) to authenticated;
grant execute on function public.can_manage_automotive_work_order_media_object(text) to authenticated;
grant execute on function public.register_automotive_work_order_media(uuid, public.automotive_media_stage, text, text) to authenticated;
grant execute on function public.remove_automotive_work_order_media(uuid) to authenticated;

drop policy if exists automotive_work_order_media_insert_scheduler_or_assignee on public.automotive_work_order_media;
drop policy if exists automotive_work_order_media_delete_scheduler_or_assignee on public.automotive_work_order_media;

revoke insert, delete on public.automotive_work_order_media from authenticated;

drop policy if exists automotive_work_order_media_select on storage.objects;
drop policy if exists automotive_work_order_media_upload on storage.objects;
drop policy if exists automotive_work_order_media_update on storage.objects;

create policy automotive_work_order_media_select
on storage.objects for select to authenticated
using (
  bucket_id = 'automotive-work-order-media'
  and public.can_read_automotive_work_order_media_object(name)
);

create policy automotive_work_order_media_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'automotive-work-order-media'
  and public.can_manage_automotive_work_order_media_object(name)
);
