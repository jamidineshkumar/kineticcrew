-- The daily promotion enqueue routine is an internal scheduler operation.
-- Only the trusted Edge Function (service_role) should be able to invoke it.
revoke all on function public.crew_enqueue_daily_promotions() from public;
revoke all on function public.crew_enqueue_daily_promotions() from anon, authenticated;
grant execute on function public.crew_enqueue_daily_promotions() to service_role;
