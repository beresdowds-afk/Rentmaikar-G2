
DO $$
DECLARE
  r RECORD;
  sig TEXT;
  whitelist TEXT[] := ARRAY[
    'get_proxy_consent_context',
    'submit_proxy_consent',
    'update_proxy_notification_prefs',
    'no_pending_application_for_email'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    IF r.proname = ANY(whitelist) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
      -- Grant to authenticated only for non-trigger functions
      IF (SELECT prorettype FROM pg_proc WHERE oid = r.oid) <> 'trigger'::regtype THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
      END IF;
    END IF;
  END LOOP;
END $$;
