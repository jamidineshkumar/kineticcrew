-- Event and rehearsal lifecycle states.
ALTER TABLE public.crew_events
  ADD COLUMN IF NOT EXISTS event_status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.crew_events
  DROP CONSTRAINT IF EXISTS crew_events_event_status_check;
ALTER TABLE public.crew_events
  ADD CONSTRAINT crew_events_event_status_check
  CHECK (event_status IN ('scheduled','postponed','cancelled'));

ALTER TABLE public.crew_feature_items
  DROP CONSTRAINT IF EXISTS crew_feature_items_status_check;
ALTER TABLE public.crew_feature_items
  ADD CONSTRAINT crew_feature_items_status_check
  CHECK (status IN ('open','approved','rejected','closed','selected','pending','postponed','cancelled'));

CREATE OR REPLACE FUNCTION public.crew_event_statuses()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $$
DECLARE v_uid text; v_role text; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  v_uid:=auth.uid()::text;
  SELECT role INTO v_role FROM public.crew_profiles WHERE auth_id=v_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Crew profile not found.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'event_status',event_status)),'[]'::jsonb)
    INTO v_rows FROM public.crew_events;
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_event_set_status(p_event_id uuid,p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $$
DECLARE v_role text; v_event public.crew_events%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  SELECT role INTO v_role FROM public.crew_profiles WHERE auth_id=auth.uid()::text;
  IF coalesce(v_role,'') NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_status NOT IN ('scheduled','postponed','cancelled') THEN RAISE EXCEPTION 'Invalid event status.'; END IF;
  UPDATE public.crew_events SET event_status=p_status,updated_at=now()
    WHERE id=p_event_id RETURNING * INTO v_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found.'; END IF;
  RETURN jsonb_build_object('id',v_event.id,'event_status',v_event.event_status,'message','Event status updated.');
END;
$$;

CREATE OR REPLACE FUNCTION public.crew_rehearsal_set_status(p_item_id uuid,p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $$
DECLARE v_role text; v_item public.crew_feature_items%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  SELECT role INTO v_role FROM public.crew_profiles WHERE auth_id=auth.uid()::text;
  IF coalesce(v_role,'') NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_status NOT IN ('open','postponed','cancelled') THEN RAISE EXCEPTION 'Invalid rehearsal status.'; END IF;
  UPDATE public.crew_feature_items SET status=p_status,updated_at=now()
    WHERE id=p_item_id AND feature='rehearsals' RETURNING * INTO v_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rehearsal not found.'; END IF;
  RETURN jsonb_build_object('id',v_item.id,'status',v_item.status,'message','Rehearsal status updated.');
END;
$$;

REVOKE ALL ON FUNCTION public.crew_event_statuses() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.crew_event_statuses() TO authenticated;
REVOKE ALL ON FUNCTION public.crew_event_set_status(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.crew_event_set_status(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.crew_rehearsal_set_status(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.crew_rehearsal_set_status(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
