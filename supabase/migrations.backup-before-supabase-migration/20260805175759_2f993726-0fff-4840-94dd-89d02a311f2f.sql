-- ============================================================
-- Security hardening: least privilege on SECURITY DEFINER routines
-- ============================================================

-- 1. Trigger functions must never be directly invocable via the Data API.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2. Signed-out callers have no business invoking user- or admin-scoped RPCs.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'can_review_applications',
        'decline_application_recovery',
        'get_my_activation_blockers',
        'get_verification_trace',
        'is_admin',
        'my_application_appeals',
        'recover_application',
        'recycle_application',
        'request_application_recovery',
        'set_my_region'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Note: check_auth_rate_limit, log_auth_event, log_verification_event,
-- get_allowed_regions, is_allowed_region and the token-based proxy consent
-- routines (get_proxy_consent_context, submit_proxy_consent,
-- update_proxy_notification_prefs) intentionally remain anon-callable —
-- they are required before a session exists.

-- 3. Call transcripts: writes are service-role only (defense in depth on top
--    of the absent write policies).
REVOKE INSERT, UPDATE, DELETE ON public.voip_call_transcripts FROM anon, authenticated;
GRANT ALL ON public.voip_call_transcripts TO service_role;

-- 4. Webhook signing secrets: never expose the table to non-admin API roles.
REVOKE ALL ON public.webhooks FROM anon;
GRANT ALL ON public.webhooks TO service_role;