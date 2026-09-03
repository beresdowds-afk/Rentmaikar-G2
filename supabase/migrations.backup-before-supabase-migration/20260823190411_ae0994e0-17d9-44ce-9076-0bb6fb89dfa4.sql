ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS gps_tracking_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vehicles.gps_tracking_enabled IS
  'Admin-controlled per-vehicle switch. When false, the unified location service drops new fixes (no state, history, or MQTT publish) for this vehicle.';

-- Extend the column-scope guard so only admins (or server-side writers) can toggle it.
CREATE OR REPLACE FUNCTION public.enforce_vehicle_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_public IS DISTINCT FROM OLD.is_public
     OR NEW.review_status IS DISTINCT FROM OLD.review_status
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.gps_tracking_enabled IS DISTINCT FROM OLD.gps_tracking_enabled THEN
    RAISE EXCEPTION 'Only administrators can change vehicle ownership, status, visibility, tracking or review outcome';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;