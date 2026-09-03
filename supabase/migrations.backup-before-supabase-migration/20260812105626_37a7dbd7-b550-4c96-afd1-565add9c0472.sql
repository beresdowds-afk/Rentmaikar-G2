-- 1. Preferences: add a push channel choice
ALTER TABLE public.event_notification_preferences
  ADD COLUMN IF NOT EXISTS push boolean NOT NULL DEFAULT true;

-- 2. Outbox: allow push deliveries
ALTER TABLE public.event_notification_outbox DROP CONSTRAINT IF EXISTS event_notification_outbox_channel_check;
ALTER TABLE public.event_notification_outbox ADD CONSTRAINT event_notification_outbox_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'slack'::text, 'webhook'::text, 'push'::text]));

-- 3. In-app notifications: allow the vehicle review kind
ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_kind_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_kind_check
  CHECK (kind = ANY (ARRAY['onboarding_stage'::text, 'access_grant'::text, 'access_revoke'::text, 'vehicle_review'::text, 'other'::text]));

-- 4. Category mapping for vehicle events
CREATE OR REPLACE FUNCTION public.notification_category_for(_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _kind LIKE 'applications%' THEN 'applications'
    WHEN _kind LIKE 'invoices%' THEN 'invoices'
    WHEN _kind LIKE 'payments%' THEN 'payments'
    WHEN _kind LIKE 'rentals%' THEN 'rentals'
    WHEN _kind LIKE 'user_subscriptions%' THEN 'subscriptions'
    WHEN _kind LIKE 'legal_agreements%' THEN 'legal_agreements'
    WHEN _kind LIKE 'rent_to_own%' THEN 'rent_to_own'
    WHEN _kind LIKE 'price_negotiations%' THEN 'negotiations'
    WHEN _kind LIKE 'vehicle_booking_requests%' THEN 'bookings'
    WHEN _kind LIKE 'vehicle_review%' OR _kind LIKE 'vehicles%' THEN 'vehicle_listings'
    WHEN _kind LIKE 'owner_payouts%' THEN 'payouts'
    WHEN _kind LIKE 'withdrawal_authorizations%' THEN 'withdrawals'
    WHEN _kind LIKE 'onboarding%' OR _kind LIKE 'access_%' THEN 'onboarding'
    ELSE 'other'
  END
$function$;

-- 5. Deep links for vehicle records
CREATE OR REPLACE FUNCTION public.event_deep_link(_table text, _record_id text, _recipient uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_staff boolean := public.is_admin(_recipient)
                        OR public.has_role(_recipient, 'admin_assistant'::app_role);
  v_role text;
  v_path text;
BEGIN
  IF v_is_staff THEN
    v_path := CASE _table
      WHEN 'applications' THEN '/admin?portal=crm&tab=applications'
      WHEN 'invoices' THEN '/admin?portal=crm&tab=billing'
      WHEN 'payments' THEN '/admin/payments'
      WHEN 'rentals' THEN '/admin/rental-reconciliation'
      WHEN 'user_subscriptions' THEN '/admin?portal=crm&tab=subscriptions'
      WHEN 'legal_agreements' THEN '/admin?portal=crm&tab=legal-agreements'
      WHEN 'rent_to_own_agreements' THEN '/admin?portal=crm&tab=rent-to-own'
      WHEN 'price_negotiations' THEN '/admin?portal=crm&tab=negotiations'
      WHEN 'vehicle_booking_requests' THEN '/admin?portal=crm&tab=approvals'
      WHEN 'vehicles' THEN '/admin/vehicle-queue'
      WHEN 'owner_payouts' THEN '/admin/treasury'
      WHEN 'withdrawal_authorizations' THEN '/admin/treasury'
      ELSE '/admin'
    END;
  ELSE
    SELECT ur.role::text INTO v_role
      FROM public.user_roles ur
     WHERE ur.user_id = _recipient
     ORDER BY CASE ur.role::text WHEN 'owner' THEN 1 WHEN 'driver' THEN 2 ELSE 3 END
     LIMIT 1;

    IF v_role = 'owner' THEN
      v_path := CASE _table
        WHEN 'invoices' THEN '/owner-dashboard?tab=earnings'
        WHEN 'payments' THEN '/owner-dashboard?tab=earnings'
        WHEN 'owner_payouts' THEN '/owner-dashboard?tab=earnings'
        WHEN 'withdrawal_authorizations' THEN '/owner-dashboard?tab=earnings'
        WHEN 'rentals' THEN '/owner-dashboard?tab=vehicles'
        WHEN 'vehicles' THEN '/owner-dashboard?tab=vehicles'
        WHEN 'rent_to_own_agreements' THEN '/owner-dashboard?tab=vehicles'
        WHEN 'legal_agreements' THEN '/owner-dashboard?tab=agreements'
        WHEN 'price_negotiations' THEN '/owner-dashboard?tab=negotiations'
        WHEN 'vehicle_booking_requests' THEN '/owner-dashboard?tab=bookings'
        WHEN 'user_subscriptions' THEN '/subscriptions'
        ELSE '/owner-dashboard'
      END;
    ELSE
      v_path := CASE _table
        WHEN 'invoices' THEN '/driver-dashboard?tab=billing'
        WHEN 'payments' THEN '/driver-dashboard?tab=billing'
        WHEN 'rentals' THEN '/driver-dashboard?tab=rentals'
        WHEN 'rent_to_own_agreements' THEN '/driver-dashboard?tab=rentals'
        WHEN 'legal_agreements' THEN '/driver-dashboard?tab=agreements'
        WHEN 'price_negotiations' THEN '/driver-dashboard?tab=negotiate'
        WHEN 'vehicle_booking_requests' THEN '/driver-dashboard?tab=bookings'
        WHEN 'user_subscriptions' THEN '/subscriptions'
        ELSE '/driver-dashboard'
      END;
    END IF;
  END IF;

  IF _record_id IS NOT NULL AND _record_id <> '' THEN
    v_path := v_path || CASE WHEN position('?' in v_path) > 0 THEN '&' ELSE '?' END
              || 'record=' || _record_id;
  END IF;

  RETURN 'https://rentmaikar.com' || v_path;
END;
$function$;

-- 6. Owner alerts when a vehicle submission is reviewed
CREATE OR REPLACE FUNCTION public.notify_vehicle_review_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid := NEW.owner_id;
  v_label text := trim(both ' ' from concat_ws(' ', NEW.year::text, NEW.make, NEW.model));
  v_status text := NEW.review_status;
  v_category text := 'vehicle_listings';
  v_kind text := 'vehicle_review';
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

  v_label := NULLIF(v_label, '');
  v_title := CASE v_status
    WHEN 'published' THEN 'Vehicle published: ' || COALESCE(v_label, 'your listing')
    WHEN 'rejected' THEN 'Vehicle rejected: ' || COALESCE(v_label, 'your listing')
    ELSE 'More information needed: ' || COALESCE(v_label, 'your listing')
  END;

  v_body := CASE v_status
    WHEN 'published' THEN 'Your vehicle is now live in the public catalogue.'
    WHEN 'rejected' THEN 'Your submission was rejected. Reason: '
                         || COALESCE(NULLIF(btrim(NEW.review_notes), ''), 'no reason provided')
    ELSE 'Our review team needs more information before publishing. '
         || COALESCE(NULLIF(btrim(NEW.review_notes), ''), '')
  END;

  -- In-app alert (unless the owner switched in-app off for this category)
  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT v_owner, v_kind, v_title, v_body, v_owner,
         jsonb_build_object(
           'table', 'vehicles',
           'record_id', NEW.id,
           'status', v_status,
           'previous_status', OLD.review_status,
           'review_notes', NEW.review_notes,
           'category', v_category,
           'deep_link', public.event_deep_link('vehicles', NEW.id::text, v_owner)
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_notification_preferences p
     WHERE p.user_id = v_owner AND p.category = v_category AND p.in_app = false
  );

  -- Outbound channels: default to push + email when the owner has no preference row.
  INSERT INTO public.event_notification_outbox
    (recipient_id, channel, category, kind, title, body, source_table, record_id, deep_link, destination, payload)
  SELECT v_owner, ch.channel, v_category, v_kind, v_title, v_body, 'vehicles', NEW.id::text,
         public.event_deep_link('vehicles', NEW.id::text, v_owner),
         ch.destination,
         jsonb_build_object(
           'table', 'vehicles',
           'record_id', NEW.id,
           'status', v_status,
           'previous_status', OLD.review_status,
           'review_notes', NEW.review_notes,
           'category', v_category
         )
    FROM (
      SELECT COALESCE(p.email, true) AS email,
             COALESCE(p.push, true) AS push,
             COALESCE(p.slack, false) AS slack,
             COALESCE(p.webhook, false) AS webhook,
             p.slack_webhook_url,
             p.webhook_url
        FROM (SELECT 1) AS anchor
        LEFT JOIN public.event_notification_preferences p
               ON p.user_id = v_owner AND p.category = v_category
    ) AS prefs
   CROSS JOIN LATERAL (
     VALUES
       ('email', CASE WHEN prefs.email THEN 'email' ELSE NULL END),
       ('push', CASE WHEN prefs.push THEN 'push' ELSE NULL END),
       ('slack', CASE WHEN prefs.slack THEN prefs.slack_webhook_url ELSE NULL END),
       ('webhook', CASE WHEN prefs.webhook THEN prefs.webhook_url ELSE NULL END)
   ) AS ch(channel, destination)
   WHERE ch.destination IS NOT NULL AND ch.destination <> '';

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_vehicle_review_outcome() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_vehicle_review_outcome ON public.vehicles;
CREATE TRIGGER trg_notify_vehicle_review_outcome
AFTER UPDATE OF review_status ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.notify_vehicle_review_outcome();