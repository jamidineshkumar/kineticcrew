-- Enforce event lifecycle state at the database boundary, not only in the UI.
CREATE OR REPLACE FUNCTION public.crew_guard_event_registration_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT event_status INTO v_status
  FROM public.crew_events
  WHERE id=NEW.event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found.';
  END IF;

  IF coalesce(v_status,'scheduled') <> 'scheduled' THEN
    RAISE EXCEPTION 'Registration is unavailable because this event is %.', v_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_guard_event_registration_status ON public.crew_registrations;
CREATE TRIGGER crew_guard_event_registration_status
BEFORE INSERT ON public.crew_registrations
FOR EACH ROW
EXECUTE FUNCTION public.crew_guard_event_registration_status();

REVOKE ALL ON FUNCTION public.crew_guard_event_registration_status() FROM public,anon,authenticated;
