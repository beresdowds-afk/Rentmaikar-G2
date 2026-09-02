
-- 1) billing_reconciliation_view: enforce security_invoker
ALTER VIEW public.billing_reconciliation_view SET (security_invoker = true);

-- 2) Tighten INSERT policies

-- iot_device_orders
DROP POLICY IF EXISTS "Owners can create their own orders" ON public.iot_device_orders;
CREATE POLICY "Owners can create their own orders" ON public.iot_device_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND COALESCE(payment_status, 'pending') = 'pending'
    AND COALESCE(shipping_status, 'pending') = 'pending'
    AND payment_confirmed_by IS NULL
    AND payment_confirmed_at IS NULL
    AND delivery_confirmed_at IS NULL
  );

-- price_negotiations
DROP POLICY IF EXISTS "Drivers can create negotiations" ON public.price_negotiations;
CREATE POLICY "Drivers can create negotiations" ON public.price_negotiations
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND COALESCE(status::text, 'pending') = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND final_daily_rate IS NULL
    AND COALESCE(is_locked, false) = false
  );

DROP POLICY IF EXISTS "Owners can create negotiations for their vehicles" ON public.price_negotiations;
CREATE POLICY "Owners can create negotiations for their vehicles" ON public.price_negotiations
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND COALESCE(status::text, 'pending') = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND final_daily_rate IS NULL
    AND COALESCE(is_locked, false) = false
  );

-- rent_to_own_listings
DROP POLICY IF EXISTS "Owners can create RTO listings" ON public.rent_to_own_listings;
CREATE POLICY "Owners can create RTO listings" ON public.rent_to_own_listings
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND COALESCE(status, 'pending') = 'pending'
    AND COALESCE(is_available, false) = false
    AND approved_by IS NULL
    AND approved_at IS NULL
  );

-- rideshare_profile_submissions
DROP POLICY IF EXISTS "Drivers can create their own profile submissions" ON public.rideshare_profile_submissions;
CREATE POLICY "Drivers can create their own profile submissions" ON public.rideshare_profile_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND COALESCE(status, 'pending') = 'pending'
    AND admin_reviewed_by IS NULL
    AND admin_reviewed_at IS NULL
  );

-- user_documents
DROP POLICY IF EXISTS "Users can upload their own documents" ON public.user_documents;
CREATE POLICY "Users can upload their own documents" ON public.user_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(status, 'pending') = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

-- vehicle_incidents
DROP POLICY IF EXISTS "Drivers can create incidents" ON public.vehicle_incidents;
CREATE POLICY "Drivers can create incidents" ON public.vehicle_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND COALESCE(status::text, 'reported') = 'reported'
    AND resolved_by IS NULL
    AND resolved_at IS NULL
    AND acknowledged_by IS NULL
    AND acknowledged_at IS NULL
  );

-- weekly_inspection_reports
DROP POLICY IF EXISTS "Drivers can create own reports" ON public.weekly_inspection_reports;
CREATE POLICY "Drivers can create own reports" ON public.weekly_inspection_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND COALESCE(status, 'pending') = 'pending'
    AND admin_decision IS NULL
    AND admin_notes IS NULL
    AND admin_id IS NULL
    AND admin_reviewed_at IS NULL
    AND owner_action IS NULL
    AND owner_notes IS NULL
    AND owner_reviewed_at IS NULL
  );

-- 3) Revoke anon EXECUTE from privileged SECURITY DEFINER functions.
-- Keep anon access ONLY for token-based proxy consent flows and the registration precheck.
REVOKE EXECUTE ON FUNCTION public.register_push_device(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_proxy_billing(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_elevenlabs_retention(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_elevenlabs_test_log(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_voice_agent_transcript(text, text, text, jsonb, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_proxy_billing(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_elevenlabs_test_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_user_subscription(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_push_device_prefs(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_proxy_terms(uuid, text, timestamptz, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sign_legal_agreement(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_proxy_charge(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_request_rental_extension(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_onboarding() FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_application(uuid, text) FROM anon;
