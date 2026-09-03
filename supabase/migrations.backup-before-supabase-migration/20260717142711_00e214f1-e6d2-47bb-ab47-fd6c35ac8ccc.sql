
DROP FUNCTION IF EXISTS public.get_proxy_consent_context(text);

CREATE OR REPLACE FUNCTION public.get_proxy_consent_context(_token text)
 RETURNS TABLE(
   proxy_account_id uuid,
   proxy_full_name text,
   proxy_phone text,
   driver_name text,
   region text,
   identity_status text,
   consent_status text,
   token_expires_at timestamp with time zone,
   notification_prefs jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN RAISE EXCEPTION 'invalid token'; END IF;
  SELECT * INTO r FROM public.driver_proxy_billing_accounts WHERE consent_token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid or expired link' USING ERRCODE='P0002'; END IF;
  IF r.consent_token_expires_at < now() THEN RAISE EXCEPTION 'link expired'; END IF;
  RETURN QUERY
    SELECT r.id, r.proxy_full_name, r.proxy_phone,
      COALESCE(p.full_name, p.email, 'the driver')::text,
      r.region, r.identity_status, r.consent_status, r.consent_token_expires_at,
      r.notification_prefs
    FROM public.profiles p WHERE p.user_id = r.driver_id
    UNION ALL
    SELECT r.id, r.proxy_full_name, r.proxy_phone, 'the driver', r.region,
      r.identity_status, r.consent_status, r.consent_token_expires_at, r.notification_prefs
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.driver_id)
    LIMIT 1;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_proxy_consent_context(text) TO anon, authenticated;
