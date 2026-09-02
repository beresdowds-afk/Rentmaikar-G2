-- 1) Column-scope guard for driver_call_ins
CREATE OR REPLACE FUNCTION public.enforce_call_in_column_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'admin_assistant')
     OR auth.uid() IS NULL THEN
    -- admins and service-role/edge-function contexts are unrestricted
    RETURN NEW;
  END IF;

  -- Non-admin (driver) updates: freeze everything except cancellation + extension request
  IF NEW.id                 IS DISTINCT FROM OLD.id
     OR NEW.driver_id       IS DISTINCT FROM OLD.driver_id
     OR NEW.rental_id       IS DISTINCT FROM OLD.rental_id
     OR NEW.vehicle_id      IS DISTINCT FROM OLD.vehicle_id
     OR NEW.type            IS DISTINCT FROM OLD.type
     OR NEW.reason          IS DISTINCT FROM OLD.reason
     OR NEW.notes           IS DISTINCT FROM OLD.notes
     OR NEW.telemetry_snapshot IS DISTINCT FROM OLD.telemetry_snapshot
     OR NEW.geofence_lat    IS DISTINCT FROM OLD.geofence_lat
     OR NEW.geofence_lng    IS DISTINCT FROM OLD.geofence_lng
     OR NEW.geofence_radius_m IS DISTINCT FROM OLD.geofence_radius_m
     OR NEW.started_at      IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at      IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'not authorized to modify protected call-in columns';
  END IF;

  -- status may only move to 'cancelled' from an active call-in
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status::text = 'active' AND NEW.status::text = 'cancelled') THEN
      RAISE EXCEPTION 'drivers may only cancel an active call-in';
    END IF;
  END IF;

  -- extension flag may only be raised, never lowered
  IF NEW.extend_requested IS DISTINCT FROM OLD.extend_requested
     AND COALESCE(NEW.extend_requested, false) = false THEN
    RAISE EXCEPTION 'not authorized to clear the extension request flag';
  END IF;

  -- ended_at/end_reason only allowed alongside a driver cancellation
  IF (NEW.ended_at IS DISTINCT FROM OLD.ended_at OR NEW.end_reason IS DISTINCT FROM OLD.end_reason)
     AND NEW.status::text <> 'cancelled' THEN
    RAISE EXCEPTION 'not authorized to modify call-in closure columns';
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_call_in_column_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_call_in_column_scope ON public.driver_call_ins;
CREATE TRIGGER trg_enforce_call_in_column_scope
  BEFORE UPDATE ON public.driver_call_ins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_call_in_column_scope();

-- 2) tour_analytics_events: require authentication and self-attribution
DROP POLICY IF EXISTS "Anyone can insert their own tour events" ON public.tour_analytics_events;

CREATE POLICY "Authenticated users insert their own tour events"
  ON public.tour_analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE INSERT ON public.tour_analytics_events FROM anon;
