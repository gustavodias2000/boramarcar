-- Do not rely solely on RLS for operations that are outside the normal Data API
-- path (for example, TRUNCATE). Grant only the table capabilities this module
-- deliberately exposes to authenticated users.

revoke all on public.appointments from anon, authenticated;
revoke all on public.professional_schedule_rules from anon, authenticated;

grant select on public.appointments to authenticated;
grant select, insert, update, delete on public.professional_schedule_rules to authenticated;
