revoke all on function public.crew_event_metadata() from public, anon;
revoke all on function public.crew_event_set_metadata(uuid,text,text,boolean) from public, anon;
grant execute on function public.crew_event_metadata() to authenticated;
grant execute on function public.crew_event_set_metadata(uuid,text,text,boolean) to authenticated;
