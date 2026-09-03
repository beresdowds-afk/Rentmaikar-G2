
CREATE OR REPLACE FUNCTION public.notify_admins_vehicle_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_label text := NULLIF(btrim(concat_ws(' ', NEW.year::text, NEW.make, NEW.model)), '');
  v_live_before boolean := false;
  v_live_after boolean;
  v_event text;
  v_title text;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  v_live_after := COALESCE(NEW.is_public, false)
                  AND COALESCE(NEW.review_status, '') = 'approved'
                  AND COALESCE(array_length(NEW.photo_urls, 1), 0) > 0;

  IF TG_OP = 'UPDATE' THEN
    v_live_before := COALESCE(OLD.is_public, false)
                     AND COALESCE(OLD.review_status, '') = 'approved'
                     AND COALESCE(array_length(OLD.photo_urls, 1), 0) > 0;

    IF OLD.is_public IS DISTINCT FROM NEW.is_public THEN v_changed := v_changed || 'visibility'; END IF;
    IF OLD.review_status IS DISTINCT FROM NEW.review_status THEN v_changed := v_changed || 'review_status'; END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN v_changed := v_changed || 'status'; END IF;
    IF OLD.photo_urls IS DISTINCT FROM NEW.photo_urls THEN v_changed := v_changed || 'photos'; END IF;
    IF OLD.pickup_city IS DISTINCT FROM NEW.pickup_city THEN v_changed := v_changed || 'pickup_city'; END IF;
  END IF;

  IF v_live_after AND NOT v_live_before THEN
    v_event := 'published';
  ELSIF v_live_before AND NOT v_live_after THEN
    v_event := 'unpublished';
  ELSIF v_live_after AND array_length(v_changed, 1) > 0 THEN
    v_event := 'updated';
  ELSE
    RETURN NEW;
  END IF;

  v_title := COALESCE(v_label, 'Vehicle listing') || ' ' || v_event;

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT DISTINCT ur.user_id,
         'vehicle_listing_' || v_event,
         v_title,
         COALESCE(v_label, 'A vehicle') || ' (' || NEW.id::text || ') was ' || v_event
           || CASE WHEN array_length(v_changed, 1) > 0
                   THEN ' - changed: ' || array_to_string(v_changed, ', ')
                   ELSE '' END,
         NEW.owner_id,
         jsonb_build_object(
           'table', 'vehicles',
           'record_id', NEW.id,
           'event', v_event,
           'changed_fields', to_jsonb(v_changed),
           'is_public', NEW.is_public,
           'review_status', NEW.review_status,
           'status', NEW.status
         )
    FROM public.user_roles ur
   WHERE ur.role::text IN ('admin', 'admin_assistant');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_admins_vehicle_listing ON public.vehicles;
CREATE TRIGGER trg_notify_admins_vehicle_listing
AFTER INSERT OR UPDATE OF is_public, review_status, status, photo_urls, pickup_city
ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_vehicle_listing_change();
