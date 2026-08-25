-- Storage objects must be removed through the Supabase Storage API. The
-- metadata command below is called immediately after that API operation.

create policy automotive_work_order_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'automotive-work-order-media'
  and public.can_manage_automotive_work_order_media_object(name)
);

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
