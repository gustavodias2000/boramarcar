-- CREATE OR REPLACE can inherit broad default execute privileges. Keep path
-- parsing internal and expose only the commands and policy helpers required by
-- authenticated clients.

revoke all on function public.parse_automotive_work_order_media_path(text) from public, anon, authenticated;
revoke all on function public.is_valid_automotive_work_order_media_path(text, uuid, uuid, public.automotive_media_stage) from public, anon, authenticated;
revoke all on function public.can_read_automotive_work_order_media_object(text) from public, anon;
revoke all on function public.can_manage_automotive_work_order_media_object(text) from public, anon;
revoke all on function public.register_automotive_work_order_media(uuid, public.automotive_media_stage, text, text) from public, anon;
revoke all on function public.remove_automotive_work_order_media(uuid) from public, anon;

grant execute on function public.can_read_automotive_work_order_media_object(text) to authenticated;
grant execute on function public.can_manage_automotive_work_order_media_object(text) to authenticated;
grant execute on function public.register_automotive_work_order_media(uuid, public.automotive_media_stage, text, text) to authenticated;
grant execute on function public.remove_automotive_work_order_media(uuid) to authenticated;
