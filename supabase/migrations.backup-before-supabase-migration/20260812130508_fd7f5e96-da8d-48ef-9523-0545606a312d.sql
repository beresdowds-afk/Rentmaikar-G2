-- Helper: is a vehicle row eligible for the public catalogue?
CREATE OR REPLACE FUNCTION public.vehicle_is_catalogue_eligible(_status text, _is_public boolean, _photos text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(_status, '') = ANY (ARRAY['available','active'])
     AND COALESCE(_is_public, false)
     AND _photos IS NOT NULL
     AND COALESCE(array_length(_photos, 1), 0) >= 1
     AND btrim(COALESCE(_photos[1], '')) <> ''
$$;

REVOKE ALL ON FUNCTION public.vehicle_is_catalogue_eligible(text, boolean, text[]) FROM PUBLIC, anon, authenticated;

-- Shared notification emitter for owner vehicle events
CREATE OR REPLACE FUNCTION public.emit_owner_vehicle_notification(
  _owner uuid, _vehicle_id uuid, _kind text, _title text, _body text, _payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_category text := 'vehicle_listings';
  v_link text := public.event_deep_link('vehicles', _vehicle_id::text, _owner);
BEGIN
  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT _owner, _kind, _title, _body, _owner,
         _payload || jsonb_build_object('category', v_category, 'deep_link', v_link)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_notification_preferences p
     WHERE p.user_id = _owner AND p.category = v_category AND p.in_app = false
  );

  INSERT INTO public.event_notification_outbox
    (recipient_id, channel, category, kind, title, body, source_table, record_id, deep_link, destination, payload)
  SELECT _owner, ch.channel, v_category, _kind, _title, _body, 'vehicles', _vehicle_id::text,
         v_link, ch.destination, _payload || jsonb_build_object('category', v_category)
    FROM (
      SELECT COALESCE(p.email, true) AS email,
             COALESCE(p.push, true) AS push,
             COALESCE(p.slack, false) AS slack,
             COALESCE(p.webhook, false) AS webhook,
             p.slack_webhook_url,
             p.webhook_url
        FROM (SELECT 1) AS anchor
        LEFT JOIN public.event_notification_preferences p
               ON p.user_id = _owner AND p.category = v_category
    ) AS prefs
   CROSS JOIN LATERAL (
     VALUES
       ('email', CASE WHEN prefs.email THEN 'email' ELSE NULL END),
       ('push', CASE WHEN prefs.push THEN 'push' ELSE NULL END),
       ('slack', CASE WHEN prefs.slack THEN prefs.slack_webhook_url ELSE NULL END),
       ('webhook', CASE WHEN prefs.webhook THEN prefs.webhook_url ELSE NULL END)
   ) AS ch(channel, destination)
   WHERE ch.destination IS NOT NULL AND ch.destination <> '';
END;
$$;

REVOKE ALL ON FUNCTION public.emit_owner_vehicle_notification(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Notify the owner the moment a vehicle becomes catalogue-eligible
CREATE OR REPLACE FUNCTION public.notify_vehicle_catalogue_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := NEW.owner_id;
  v_label text := NULLIF(btrim(concat_ws(' ', NEW.year::text, NEW.make, NEW.model)), '');
  v_before boolean;
  v_after boolean;
BEGIN
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  v_after := public.vehicle_is_catalogue_eligible(NEW.status, NEW.is_public, NEW.photo_urls);
  v_before := CASE WHEN TG_OP = 'INSERT' THEN false
                   ELSE public.vehicle_is_catalogue_eligible(OLD.status, OLD.is_public, OLD.photo_urls) END;

  IF v_after AND NOT v_before THEN
    PERFORM public.emit_owner_vehicle_notification(
      v_owner, NEW.id, 'vehicles_catalogue_live',
      'Now live in the catalogue: ' || COALESCE(v_label, 'your vehicle'),
      'Your vehicle registration was approved and is now visible to drivers in the public catalogue.',
      jsonb_build_object('table', 'vehicles', 'record_id', NEW.id, 'status', NEW.status, 'event', 'catalogue_live')
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_vehicle_catalogue_live() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_vehicle_catalogue_live ON public.vehicles;
CREATE TRIGGER trg_notify_vehicle_catalogue_live
AFTER INSERT OR UPDATE OF status, is_public, photo_urls, review_status ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.notify_vehicle_catalogue_live();

-- Refine the approval message: don't claim it is live when photos are missing,
-- and don't duplicate the "live" message emitted by the eligibility trigger.
CREATE OR REPLACE FUNCTION public.notify_vehicle_review_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := NEW.owner_id;
  v_label text := NULLIF(btrim(concat_ws(' ', NEW.year::text, NEW.make, NEW.model)), '');
  v_status text := NEW.review_status;
  v_eligible boolean;
  v_was_eligible boolean;
  v_title text;
  v_body text;
BEGIN
  IF v_owner IS NULL OR v_status IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(OLD.review_status, '') = COALESCE(v_status, '') THEN
    RETURN NEW;
  END IF;
  IF v_status NOT IN ('published', 'rejected', 'needs_info') THEN
    RETURN NEW;
  END IF;

  v_eligible := public.vehicle_is_catalogue_eligible(NEW.status, NEW.is_public, NEW.photo_urls);
  v_was_eligible := public.vehicle_is_catalogue_eligible(OLD.status, OLD.is_public, OLD.photo_urls);

  -- The catalogue-live trigger already covers this exact transition.
  IF v_status = 'published' AND v_eligible AND NOT v_was_eligible THEN
    RETURN NEW;
  END IF;

  v_title := CASE v_status
    WHEN 'published' THEN 'Vehicle approved: ' || COALESCE(v_label, 'your listing')
    WHEN 'rejected' THEN 'Vehicle rejected: ' || COALESCE(v_label, 'your listing')
    ELSE 'More information needed: ' || COALESCE(v_label, 'your listing')
  END;

  v_body := CASE v_status
    WHEN 'published' THEN
      CASE WHEN v_eligible
        THEN 'Your vehicle is approved and visible in the public catalogue.'
        ELSE 'Your vehicle is approved, but it will only appear in the public catalogue once you upload at least one verified photo.'
      END
    WHEN 'rejected' THEN 'Your submission was rejected. Reason: '
                         || COALESCE(NULLIF(btrim(NEW.review_notes), ''), 'no reason provided')
    ELSE 'Our review team needs more information before publishing. '
         || COALESCE(NULLIF(btrim(NEW.review_notes), ''), '')
  END;

  PERFORM public.emit_owner_vehicle_notification(
    v_owner, NEW.id, 'vehicle_review', v_title, v_body,
    jsonb_build_object(
      'table', 'vehicles', 'record_id', NEW.id, 'status', v_status,
      'previous_status', OLD.review_status, 'review_notes', NEW.review_notes
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_vehicle_review_outcome() FROM PUBLIC, anon, authenticated;