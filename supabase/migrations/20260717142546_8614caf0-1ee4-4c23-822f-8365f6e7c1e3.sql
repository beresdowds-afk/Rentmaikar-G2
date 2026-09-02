
ALTER TABLE public.driver_proxy_billing_accounts
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT jsonb_build_object(
    'channels', jsonb_build_object('email', true, 'sms', false, 'whatsapp', false),
    'events', jsonb_build_object(
      'consent_reminder', true,
      'identity_result', true,
      'admin_review', true,
      'card_activated', true,
      'charge_receipt', true,
      'charge_failed', true,
      'expiry_warning', true,
      'revoked', true
    )
  );

CREATE OR REPLACE FUNCTION public.update_proxy_notification_prefs(
  _proxy_id UUID,
  _prefs JSONB,
  _token TEXT DEFAULT NULL
)
RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.driver_proxy_billing_accounts;
  uid UUID := auth.uid();
  merged JSONB;
BEGIN
  SELECT * INTO r FROM public.driver_proxy_billing_accounts WHERE id = _proxy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;

  -- Authorization: admin, driver, or the proxy via consent token
  IF NOT public.is_admin()
     AND uid IS DISTINCT FROM r.driver_id
     AND (_token IS NULL OR r.consent_token IS DISTINCT FROM _token)
  THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;

  IF _prefs IS NULL OR jsonb_typeof(_prefs) <> 'object' THEN
    RAISE EXCEPTION 'invalid prefs payload';
  END IF;

  -- Deep merge onto existing prefs so partial updates work
  merged := COALESCE(r.notification_prefs, '{}'::jsonb);
  IF _prefs ? 'channels' THEN
    merged := jsonb_set(merged, '{channels}', COALESCE(merged->'channels','{}'::jsonb) || (_prefs->'channels'), true);
  END IF;
  IF _prefs ? 'events' THEN
    merged := jsonb_set(merged, '{events}', COALESCE(merged->'events','{}'::jsonb) || (_prefs->'events'), true);
  END IF;

  UPDATE public.driver_proxy_billing_accounts
     SET notification_prefs = merged
   WHERE id = _proxy_id
   RETURNING * INTO r;

  INSERT INTO public.proxy_billing_audit_log(
    proxy_account_id, driver_id, actor_id,
    actor_role, action, details, previous_state, new_state
  ) VALUES (
    r.id, r.driver_id, uid,
    CASE WHEN public.is_admin() THEN 'admin'
         WHEN uid = r.driver_id THEN 'driver'
         ELSE 'proxy' END,
    'notification_prefs_updated',
    _prefs,
    jsonb_build_object('notification_prefs', COALESCE(r.notification_prefs,'{}'::jsonb)),
    jsonb_build_object('notification_prefs', merged)
  );

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_proxy_notification_prefs(UUID, JSONB, TEXT) TO anon, authenticated;
