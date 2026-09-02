CREATE TABLE IF NOT EXISTS public.event_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  slack boolean NOT NULL DEFAULT false,
  webhook boolean NOT NULL DEFAULT false,
  slack_webhook_url text,
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_notification_preferences TO authenticated;
GRANT ALL ON public.event_notification_preferences TO service_role;

ALTER TABLE public.event_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.event_notification_preferences;
CREATE POLICY "Users manage own notification preferences"
ON public.event_notification_preferences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view notification preferences" ON public.event_notification_preferences;
CREATE POLICY "Admins view notification preferences"
ON public.event_notification_preferences
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_enp_updated_at ON public.event_notification_preferences;
CREATE TRIGGER trg_enp_updated_at
BEFORE UPDATE ON public.event_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Map a notification kind / table name to a preference category
CREATE OR REPLACE FUNCTION public.notification_category_for(_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
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
    WHEN _kind LIKE 'owner_payouts%' THEN 'payouts'
    WHEN _kind LIKE 'withdrawal_authorizations%' THEN 'withdrawals'
    WHEN _kind LIKE 'onboarding%' OR _kind LIKE 'access_%' THEN 'onboarding'
    ELSE 'other'
  END
$$;

REVOKE EXECUTE ON FUNCTION public.notification_category_for(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_category_for(text) TO authenticated, service_role;

-- Respect in-app opt-outs when fanning out record events
CREATE OR REPLACE FUNCTION public.notify_record_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_record_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_record_event() TO service_role;