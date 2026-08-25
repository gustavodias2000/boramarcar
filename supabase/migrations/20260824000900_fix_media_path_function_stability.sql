-- regexp_match is STABLE in PostgreSQL, so the path helpers must not claim a
-- stronger volatility guarantee.

create or replace function public.parse_automotive_work_order_media_path(
  p_storage_path text
)
returns table (
  tenant_id uuid,
  work_order_id uuid,
  stage public.automotive_media_stage
)
language plpgsql
stable
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
stable
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
