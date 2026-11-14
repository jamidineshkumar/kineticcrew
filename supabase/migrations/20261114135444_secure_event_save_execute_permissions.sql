REVOKE EXECUTE ON FUNCTION public.crew_event_save(uuid,text,text,text,timestamp with time zone,integer,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_event_save(uuid,text,text,text,timestamp with time zone,integer,text,text,boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.crew_event_save(uuid,text,text,text,timestamp with time zone,integer,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_event_save(uuid,text,text,text,timestamp with time zone,integer,text,text,boolean,boolean) TO authenticated;
