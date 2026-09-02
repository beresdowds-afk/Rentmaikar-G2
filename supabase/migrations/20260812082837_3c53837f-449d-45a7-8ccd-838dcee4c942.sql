ALTER TABLE public.event_notification_preferences
  ADD COLUMN IF NOT EXISTS webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE TABLE IF NOT EXISTS public.event_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','slack','webhook')),
  category text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  source_table text,
  record_id text,
  deep_link text,
  destination text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
  ON public.event_notification_outbox (status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_event_outbox_recipient
  ON public.event_notification_outbox (recipient_id, created_at DESC);

GRANT SELECT ON public.event_notification_outbox TO authenticated;
GRANT ALL ON public.event_notification_outbox TO service_role;

ALTER TABLE public.event_notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their own outbox entries" ON public.event_notification_outbox;
CREATE POLICY "Users view their own outbox entries"
  ON public.event_notification_outbox FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_event_outbox_updated_at ON public.event_notification_outbox;
CREATE TRIGGER trg_event_outbox_updated_at
  BEFORE UPDATE ON public.event_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deep link builder: staff go to the admin record view, drivers/owners to their dashboard tab.
CREATE OR REPLACE FUNCTION public.event_deep_link(_table text, _record_id text, _recipient uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.event_deep_link(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_deep_link(text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_record_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_label text := TG_ARGV[0];
  v_cols text[] := string_to_array(COALESCE(TG_ARGV[1], ''), ',');
  v_roles text[] := string_to_array(COALESCE(TG_ARGV[2], 'admin,admin_assistant'), ',');
  v_status text := v_new->>'status';
  v_prev text := v_old->>'status';
  v_title text;
  v_body text;
  v_kind text;
  v_category text;
  v_recipients uuid[] := ARRAY[]::uuid[];
  v_col text;
  v_val text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(v_status, '') = COALESCE(v_prev, '') THEN
    RETURN NEW;
  END IF;

  v_kind := TG_TABLE_NAME || CASE WHEN TG_OP = 'INSERT' THEN '_created' ELSE '_status' END;
  v_category := public.notification_category_for(v_kind);
  v_title := v_label || CASE
    WHEN TG_OP = 'INSERT' THEN ' created'
    ELSE ' ' || COALESCE(replace(v_status, '_', ' '), 'updated')
  END;
  v_body := CASE
    WHEN TG_OP = 'INSERT' THEN v_label || ' ' || COALESCE(v_new->>'id', '') || ' was created'
    ELSE v_label || ' ' || COALESCE(v_new->>'id', '') || ' moved from '
         || COALESCE(v_prev, 'n/a') || ' to ' || COALESCE(v_status, 'n/a')
  END;

  FOREACH v_col IN ARRAY v_cols LOOP
    v_col := btrim(v_col);
    CONTINUE WHEN v_col = '';
    v_val := v_new->>v_col;
    IF v_val IS NOT NULL AND v_val <> '' THEN
      BEGIN
        v_recipients := v_recipients || v_val::uuid;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END LOOP;

  SELECT v_recipients || COALESCE(array_agg(ur.user_id), ARRAY[]::uuid[])
    INTO v_recipients
    FROM public.user_roles ur
   WHERE ur.role::text = ANY (v_roles);

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT DISTINCT r,
         v_kind,
         v_title,
         v_body,
         NULLIF(v_new->>'user_id', '')::uuid,
         jsonb_build_object(
           'table', TG_TABLE_NAME,
           'record_id', v_new->>'id',
           'operation', TG_OP,
           'status', v_status,
           'previous_status', v_prev,
           'category', v_category
         )
    FROM unnest(v_recipients) AS r
   WHERE r IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.event_notification_preferences p
        WHERE p.user_id = r AND p.category = v_category AND p.in_app = false
     );

  -- Queue outbound channels (email / Slack / webhook) for opted-in recipients.
  INSERT INTO public.event_notification_outbox
    (recipient_id, channel, category, kind, title, body, source_table, record_id, deep_link, destination, payload)
  SELECT DISTINCT ON (p.user_id, ch.channel)
         p.user_id,
         ch.channel,
         v_category,
         v_kind,
         v_title,
         v_body,
         TG_TABLE_NAME,
         v_new->>'id',
         public.event_deep_link(TG_TABLE_NAME, v_new->>'id', p.user_id),
         ch.destination,
         jsonb_build_object(
           'table', TG_TABLE_NAME,
           'record_id', v_new->>'id',
           'operation', TG_OP,
           'status', v_status,
           'previous_status', v_prev,
           'category', v_category
         )
    FROM public.event_notification_preferences p
    JOIN unnest(v_recipients) AS r(uid) ON r.uid = p.user_id
   CROSS JOIN LATERAL (
     VALUES
       ('email', CASE WHEN p.email THEN 'email' ELSE NULL END),
       ('slack', CASE WHEN p.slack THEN p.slack_webhook_url ELSE NULL END),
       ('webhook', CASE WHEN p.webhook THEN p.webhook_url ELSE NULL END)
   ) AS ch(channel, destination)
   WHERE p.category = v_category
     AND ch.destination IS NOT NULL
     AND ch.destination <> '';

  RETURN NEW;
END;
$function$;

SELECT cron.schedule(
  'dispatch-event-notifications-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url:='https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/dispatch-event-notifications',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' limit 1)),
    body:=jsonb_build_object('scheduled_at', now())
  );
  $$
);