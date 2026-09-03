
-- Push device registry (native iOS/Android + web push)
CREATE TABLE IF NOT EXISTS public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  token TEXT NOT NULL,
  device_label TEXT,
  notification_prefs JSONB NOT NULL DEFAULT jsonb_build_object(
    'channels', jsonb_build_object('push', true, 'email', true),
    'events', jsonb_build_object(
      'proxy_status', true,
      'payment_updates', true,
      'agreement_updates', true,
      'inspection_reminders', true,
      'inbox_messages', true
    )
  ),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push devices"
  ON public.push_devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all push devices"
  ON public.push_devices FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Register/refresh helper called from clients (native + web)
CREATE OR REPLACE FUNCTION public.register_push_device(
  _platform TEXT,
  _token TEXT,
  _device_label TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _platform NOT IN ('ios','android','web') THEN RAISE EXCEPTION 'invalid platform'; END IF;
  IF _token IS NULL OR length(_token) < 8 THEN RAISE EXCEPTION 'invalid token'; END IF;

  INSERT INTO public.push_devices(user_id, platform, token, device_label)
    VALUES (_uid, _platform, _token, _device_label)
  ON CONFLICT (user_id, token) DO UPDATE
    SET last_seen_at = now(), device_label = COALESCE(EXCLUDED.device_label, public.push_devices.device_label)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_push_device_prefs(
  _device_id UUID,
  _prefs JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.push_devices
    SET notification_prefs = COALESCE(_prefs, notification_prefs), updated_at = now()
    WHERE id = _device_id AND user_id = _uid;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.update_push_device_prefs(UUID,JSONB) TO authenticated;

-- Enable realtime replication for tables the mobile/PWA clients live-sync on.
-- Wrap each ADD TABLE so re-runs on tables already in the publication succeed.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'driver_proxy_billing_accounts',
    'proxy_billing_audit_log',
    'push_devices',
    'inbox_messages',
    'inbox_conversations',
    'unified_message_log',
    'invoices',
    'receipts',
    'payments',
    'rentals',
    'legal_agreements',
    'vehicle_incidents'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- Ensure full row payloads for UPDATE/DELETE change events
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
