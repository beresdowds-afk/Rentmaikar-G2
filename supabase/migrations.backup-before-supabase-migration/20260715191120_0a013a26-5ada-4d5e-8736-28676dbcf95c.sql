
-- ============================================================================
-- 1. Permission-denied audit log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.permission_denied_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attempted_at    timestamptz NOT NULL DEFAULT now(),
  target_table    text NOT NULL,
  target_row_id   text,
  reason          text NOT NULL,
  attempted_fields text[] NOT NULL DEFAULT '{}',
  attempted_values jsonb DEFAULT '{}'::jsonb,
  session_role    text
);

GRANT SELECT ON public.permission_denied_log TO authenticated;
GRANT ALL    ON public.permission_denied_log TO service_role;

ALTER TABLE public.permission_denied_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view permission denied log" ON public.permission_denied_log;
CREATE POLICY "Admins view permission denied log"
  ON public.permission_denied_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service role manages permission denied log" ON public.permission_denied_log;
CREATE POLICY "Service role manages permission denied log"
  ON public.permission_denied_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_permission_denied_user
  ON public.permission_denied_log(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_denied_table
  ON public.permission_denied_log(target_table, attempted_at DESC);

-- ============================================================================
-- 2. Helper: write a denied-attempt row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_permission_denied(
  _table       text,
  _target_id   text,
  _reason      text,
  _fields      text[]  DEFAULT '{}',
  _values      jsonb   DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.permission_denied_log(
    user_id, target_table, target_row_id, reason,
    attempted_fields, attempted_values, session_role
  ) VALUES (
    auth.uid(), _table, _target_id, _reason,
    COALESCE(_fields, '{}'), COALESCE(_values, '{}'::jsonb),
    current_setting('role', true)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_permission_denied failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.log_permission_denied(text,text,text,text[],jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_permission_denied(text,text,text,text[],jsonb) TO authenticated, service_role;

-- ============================================================================
-- 3. Trigger guards — soft-fail: revert + log + NOTICE.
-- ============================================================================

-- ---- legal_agreements -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_legal_agreement_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid   := auth.uid();
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF NEW.owner_signature IS DISTINCT FROM OLD.owner_signature THEN
      denied := denied || 'owner_signature'; vals := vals || jsonb_build_object('owner_signature', NEW.owner_signature);
      NEW.owner_signature := OLD.owner_signature; END IF;
    IF NEW.owner_signed_at IS DISTINCT FROM OLD.owner_signed_at THEN denied := denied || 'owner_signed_at'; NEW.owner_signed_at := OLD.owner_signed_at; END IF;
    IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN denied := denied || 'admin_witness_signature'; NEW.admin_witness_signature := OLD.admin_witness_signature; END IF;
    IF NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at THEN denied := denied || 'admin_witnessed_at'; NEW.admin_witnessed_at := OLD.admin_witnessed_at; END IF;
    IF NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id THEN denied := denied || 'admin_witness_id'; NEW.admin_witness_id := OLD.admin_witness_id; END IF;
    IF NEW.agreement_content IS DISTINCT FROM OLD.agreement_content THEN denied := denied || 'agreement_content'; NEW.agreement_content := OLD.agreement_content; END IF;
    IF NEW.agreement_type IS DISTINCT FROM OLD.agreement_type THEN denied := denied || 'agreement_type'; NEW.agreement_type := OLD.agreement_type; END IF;
    IF NEW.agreement_version IS DISTINCT FROM OLD.agreement_version THEN denied := denied || 'agreement_version'; NEW.agreement_version := OLD.agreement_version; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
    IF NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN denied := denied || 'pdf_url'; NEW.pdf_url := OLD.pdf_url; END IF;
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN denied := denied || 'expires_at'; NEW.expires_at := OLD.expires_at; END IF;
    IF NEW.is_compulsory IS DISTINCT FROM OLD.is_compulsory THEN denied := denied || 'is_compulsory'; NEW.is_compulsory := OLD.is_compulsory; END IF;
    IF NEW.parent_agreement_id IS DISTINCT FROM OLD.parent_agreement_id THEN denied := denied || 'parent_agreement_id'; NEW.parent_agreement_id := OLD.parent_agreement_id; END IF;

  ELSIF uid = OLD.owner_id THEN
    IF NEW.driver_signature IS DISTINCT FROM OLD.driver_signature THEN denied := denied || 'driver_signature'; vals := vals || jsonb_build_object('driver_signature', NEW.driver_signature); NEW.driver_signature := OLD.driver_signature; END IF;
    IF NEW.driver_signed_at IS DISTINCT FROM OLD.driver_signed_at THEN denied := denied || 'driver_signed_at'; NEW.driver_signed_at := OLD.driver_signed_at; END IF;
    IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN denied := denied || 'admin_witness_signature'; NEW.admin_witness_signature := OLD.admin_witness_signature; END IF;
    IF NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at THEN denied := denied || 'admin_witnessed_at'; NEW.admin_witnessed_at := OLD.admin_witnessed_at; END IF;
    IF NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id THEN denied := denied || 'admin_witness_id'; NEW.admin_witness_id := OLD.admin_witness_id; END IF;
    IF NEW.agreement_content IS DISTINCT FROM OLD.agreement_content THEN denied := denied || 'agreement_content'; NEW.agreement_content := OLD.agreement_content; END IF;
    IF NEW.agreement_type IS DISTINCT FROM OLD.agreement_type THEN denied := denied || 'agreement_type'; NEW.agreement_type := OLD.agreement_type; END IF;
    IF NEW.agreement_version IS DISTINCT FROM OLD.agreement_version THEN denied := denied || 'agreement_version'; NEW.agreement_version := OLD.agreement_version; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; NEW.status := OLD.status; END IF;
    IF NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN denied := denied || 'pdf_url'; NEW.pdf_url := OLD.pdf_url; END IF;
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN denied := denied || 'expires_at'; NEW.expires_at := OLD.expires_at; END IF;
    IF NEW.is_compulsory IS DISTINCT FROM OLD.is_compulsory THEN denied := denied || 'is_compulsory'; NEW.is_compulsory := OLD.is_compulsory; END IF;
    IF NEW.parent_agreement_id IS DISTINCT FROM OLD.parent_agreement_id THEN denied := denied || 'parent_agreement_id'; NEW.parent_agreement_id := OLD.parent_agreement_id; END IF;
  END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('legal_agreements', OLD.id::text,
      'Non-admin attempted to modify admin/counterparty fields on legal agreement', denied, vals);
    RAISE NOTICE 'Blocked update to protected legal_agreements fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- rent_to_own_agreements ----------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rto_agreement_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    uuid   := auth.uid();
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF NEW.owner_signature IS DISTINCT FROM OLD.owner_signature THEN denied := denied || 'owner_signature'; vals := vals || jsonb_build_object('owner_signature', NEW.owner_signature); NEW.owner_signature := OLD.owner_signature; END IF;
    IF NEW.owner_signed_at IS DISTINCT FROM OLD.owner_signed_at THEN denied := denied || 'owner_signed_at'; NEW.owner_signed_at := OLD.owner_signed_at; END IF;
    IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN denied := denied || 'admin_witness_signature'; NEW.admin_witness_signature := OLD.admin_witness_signature; END IF;
    IF NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at THEN denied := denied || 'admin_witnessed_at'; NEW.admin_witnessed_at := OLD.admin_witnessed_at; END IF;
    IF NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id THEN denied := denied || 'admin_witness_id'; NEW.admin_witness_id := OLD.admin_witness_id; END IF;
    IF NEW.agreement_content IS DISTINCT FROM OLD.agreement_content THEN denied := denied || 'agreement_content'; NEW.agreement_content := OLD.agreement_content; END IF;
    IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN denied := denied || 'total_price'; vals := vals || jsonb_build_object('total_price', NEW.total_price); NEW.total_price := OLD.total_price; END IF;
    IF NEW.down_payment IS DISTINCT FROM OLD.down_payment THEN denied := denied || 'down_payment'; NEW.down_payment := OLD.down_payment; END IF;
    IF NEW.monthly_payment IS DISTINCT FROM OLD.monthly_payment THEN denied := denied || 'monthly_payment'; NEW.monthly_payment := OLD.monthly_payment; END IF;
    IF NEW.duration_months IS DISTINCT FROM OLD.duration_months THEN denied := denied || 'duration_months'; NEW.duration_months := OLD.duration_months; END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN denied := denied || 'currency'; NEW.currency := OLD.currency; END IF;
    IF NEW.allow_buyout IS DISTINCT FROM OLD.allow_buyout THEN denied := denied || 'allow_buyout'; NEW.allow_buyout := OLD.allow_buyout; END IF;
    IF NEW.allow_conversion_to_rental IS DISTINCT FROM OLD.allow_conversion_to_rental THEN denied := denied || 'allow_conversion_to_rental'; NEW.allow_conversion_to_rental := OLD.allow_conversion_to_rental; END IF;
    IF NEW.payments_made IS DISTINCT FROM OLD.payments_made THEN denied := denied || 'payments_made'; NEW.payments_made := OLD.payments_made; END IF;
    IF NEW.total_amount_paid IS DISTINCT FROM OLD.total_amount_paid THEN denied := denied || 'total_amount_paid'; NEW.total_amount_paid := OLD.total_amount_paid; END IF;
    IF NEW.next_payment_due IS DISTINCT FROM OLD.next_payment_due THEN denied := denied || 'next_payment_due'; NEW.next_payment_due := OLD.next_payment_due; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
    IF NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN denied := denied || 'resolution_notes'; NEW.resolution_notes := OLD.resolution_notes; END IF;
    IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN denied := denied || 'resolved_at'; NEW.resolved_at := OLD.resolved_at; END IF;
    IF NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN denied := denied || 'resolved_by'; NEW.resolved_by := OLD.resolved_by; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN denied := denied || 'listing_id'; NEW.listing_id := OLD.listing_id; END IF;

  ELSIF uid = OLD.owner_id THEN
    IF NEW.driver_signature IS DISTINCT FROM OLD.driver_signature THEN denied := denied || 'driver_signature'; vals := vals || jsonb_build_object('driver_signature', NEW.driver_signature); NEW.driver_signature := OLD.driver_signature; END IF;
    IF NEW.driver_signed_at IS DISTINCT FROM OLD.driver_signed_at THEN denied := denied || 'driver_signed_at'; NEW.driver_signed_at := OLD.driver_signed_at; END IF;
    IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN denied := denied || 'admin_witness_signature'; NEW.admin_witness_signature := OLD.admin_witness_signature; END IF;
    IF NEW.admin_witnessed_at IS DISTINCT FROM OLD.admin_witnessed_at THEN denied := denied || 'admin_witnessed_at'; NEW.admin_witnessed_at := OLD.admin_witnessed_at; END IF;
    IF NEW.admin_witness_id IS DISTINCT FROM OLD.admin_witness_id THEN denied := denied || 'admin_witness_id'; NEW.admin_witness_id := OLD.admin_witness_id; END IF;
    IF NEW.agreement_content IS DISTINCT FROM OLD.agreement_content THEN denied := denied || 'agreement_content'; NEW.agreement_content := OLD.agreement_content; END IF;
    IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN denied := denied || 'total_price'; NEW.total_price := OLD.total_price; END IF;
    IF NEW.down_payment IS DISTINCT FROM OLD.down_payment THEN denied := denied || 'down_payment'; NEW.down_payment := OLD.down_payment; END IF;
    IF NEW.monthly_payment IS DISTINCT FROM OLD.monthly_payment THEN denied := denied || 'monthly_payment'; NEW.monthly_payment := OLD.monthly_payment; END IF;
    IF NEW.duration_months IS DISTINCT FROM OLD.duration_months THEN denied := denied || 'duration_months'; NEW.duration_months := OLD.duration_months; END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN denied := denied || 'currency'; NEW.currency := OLD.currency; END IF;
    IF NEW.allow_buyout IS DISTINCT FROM OLD.allow_buyout THEN denied := denied || 'allow_buyout'; NEW.allow_buyout := OLD.allow_buyout; END IF;
    IF NEW.allow_conversion_to_rental IS DISTINCT FROM OLD.allow_conversion_to_rental THEN denied := denied || 'allow_conversion_to_rental'; NEW.allow_conversion_to_rental := OLD.allow_conversion_to_rental; END IF;
    IF NEW.payments_made IS DISTINCT FROM OLD.payments_made THEN denied := denied || 'payments_made'; NEW.payments_made := OLD.payments_made; END IF;
    IF NEW.total_amount_paid IS DISTINCT FROM OLD.total_amount_paid THEN denied := denied || 'total_amount_paid'; NEW.total_amount_paid := OLD.total_amount_paid; END IF;
    IF NEW.next_payment_due IS DISTINCT FROM OLD.next_payment_due THEN denied := denied || 'next_payment_due'; NEW.next_payment_due := OLD.next_payment_due; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; NEW.status := OLD.status; END IF;
    IF NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN denied := denied || 'resolution_notes'; NEW.resolution_notes := OLD.resolution_notes; END IF;
    IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN denied := denied || 'resolved_at'; NEW.resolved_at := OLD.resolved_at; END IF;
    IF NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN denied := denied || 'resolved_by'; NEW.resolved_by := OLD.resolved_by; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN denied := denied || 'listing_id'; NEW.listing_id := OLD.listing_id; END IF;
  END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('rent_to_own_agreements', OLD.id::text,
      'Non-admin attempted to modify admin/counterparty fields on RTO agreement', denied, vals);
    RAISE NOTICE 'Blocked update to protected rent_to_own_agreements fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- price_negotiations ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_price_negotiation_column_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
  IF NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN denied := denied || 'is_locked'; NEW.is_locked := OLD.is_locked; END IF;
  IF NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN denied := denied || 'locked_at'; NEW.locked_at := OLD.locked_at; END IF;
  IF NEW.locked_by IS DISTINCT FROM OLD.locked_by THEN denied := denied || 'locked_by'; NEW.locked_by := OLD.locked_by; END IF;
  IF NEW.admin_response IS DISTINCT FROM OLD.admin_response THEN denied := denied || 'admin_response'; NEW.admin_response := OLD.admin_response; END IF;
  IF NEW.admin_counter_offer IS DISTINCT FROM OLD.admin_counter_offer THEN denied := denied || 'admin_counter_offer'; vals := vals || jsonb_build_object('admin_counter_offer', NEW.admin_counter_offer); NEW.admin_counter_offer := OLD.admin_counter_offer; END IF;
  IF NEW.final_daily_rate IS DISTINCT FROM OLD.final_daily_rate THEN denied := denied || 'final_daily_rate'; vals := vals || jsonb_build_object('final_daily_rate', NEW.final_daily_rate); NEW.final_daily_rate := OLD.final_daily_rate; END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN denied := denied || 'approved_at'; NEW.approved_at := OLD.approved_at; END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN denied := denied || 'approved_by'; NEW.approved_by := OLD.approved_by; END IF;
  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN denied := denied || 'rejection_reason'; NEW.rejection_reason := OLD.rejection_reason; END IF;
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('price_negotiations', OLD.id::text,
      'Non-admin attempted to change approval, locking, or admin-response fields on price negotiation',
      denied, vals);
    RAISE NOTICE 'Blocked update to protected price_negotiations fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- rentals --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rental_column_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid    uuid   := auth.uid();
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id THEN
    IF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate THEN denied := denied || 'daily_rate'; vals := vals || jsonb_build_object('daily_rate', NEW.daily_rate); NEW.daily_rate := OLD.daily_rate; END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN denied := denied || 'currency'; NEW.currency := OLD.currency; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
    IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN denied := denied || 'start_date'; NEW.start_date := OLD.start_date; END IF;
    IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN denied := denied || 'end_date'; NEW.end_date := OLD.end_date; END IF;
    IF NEW.extended_end_date IS DISTINCT FROM OLD.extended_end_date THEN denied := denied || 'extended_end_date'; NEW.extended_end_date := OLD.extended_end_date; END IF;
    IF NEW.extension_approved IS DISTINCT FROM OLD.extension_approved THEN denied := denied || 'extension_approved'; NEW.extension_approved := OLD.extension_approved; END IF;
    IF NEW.payment_frequency IS DISTINCT FROM OLD.payment_frequency THEN denied := denied || 'payment_frequency'; NEW.payment_frequency := OLD.payment_frequency; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.region IS DISTINCT FROM OLD.region THEN denied := denied || 'region'; NEW.region := OLD.region; END IF;
    IF NEW.return_confirmed_at IS DISTINCT FROM OLD.return_confirmed_at THEN denied := denied || 'return_confirmed_at'; NEW.return_confirmed_at := OLD.return_confirmed_at; END IF;
    IF NEW.return_reminder_sent IS DISTINCT FROM OLD.return_reminder_sent THEN denied := denied || 'return_reminder_sent'; NEW.return_reminder_sent := OLD.return_reminder_sent; END IF;
  END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('rentals', OLD.id::text,
      'Driver attempted to modify rental terms', denied, vals);
    RAISE NOTICE 'Blocked update to protected rentals fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- rideshare_profile_submissions ---------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rideshare_submission_column_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
  IF NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at THEN denied := denied || 'admin_reviewed_at'; NEW.admin_reviewed_at := OLD.admin_reviewed_at; END IF;
  IF NEW.admin_reviewed_by IS DISTINCT FROM OLD.admin_reviewed_by THEN denied := denied || 'admin_reviewed_by'; NEW.admin_reviewed_by := OLD.admin_reviewed_by; END IF;
  IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN denied := denied || 'admin_notes'; NEW.admin_notes := OLD.admin_notes; END IF;
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
  IF NEW.week_start_date IS DISTINCT FROM OLD.week_start_date THEN denied := denied || 'week_start_date'; NEW.week_start_date := OLD.week_start_date; END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('rideshare_profile_submissions', OLD.id::text,
      'Non-admin attempted to change review status or admin fields on rideshare submission',
      denied, vals);
    RAISE NOTICE 'Blocked update to protected rideshare_profile_submissions fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- vehicle_incidents ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_vehicle_incident_column_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() OR public.is_any_support_staff(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.severity IS DISTINCT FROM OLD.severity THEN denied := denied || 'severity'; vals := vals || jsonb_build_object('severity', NEW.severity); NEW.severity := OLD.severity; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; vals := vals || jsonb_build_object('status', NEW.status); NEW.status := OLD.status; END IF;
  IF NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN denied := denied || 'resolution_notes'; NEW.resolution_notes := OLD.resolution_notes; END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN denied := denied || 'resolved_at'; NEW.resolved_at := OLD.resolved_at; END IF;
  IF NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN denied := denied || 'resolved_by'; NEW.resolved_by := OLD.resolved_by; END IF;
  IF NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN denied := denied || 'acknowledged_at'; NEW.acknowledged_at := OLD.acknowledged_at; END IF;
  IF NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by THEN denied := denied || 'acknowledged_by'; NEW.acknowledged_by := OLD.acknowledged_by; END IF;
  IF NEW.iot_data IS DISTINCT FROM OLD.iot_data THEN denied := denied || 'iot_data'; NEW.iot_data := OLD.iot_data; END IF;
  IF NEW.is_iot_detected IS DISTINCT FROM OLD.is_iot_detected THEN denied := denied || 'is_iot_detected'; NEW.is_iot_detected := OLD.is_iot_detected; END IF;
  IF NEW.iot_trigger_type IS DISTINCT FROM OLD.iot_trigger_type THEN denied := denied || 'iot_trigger_type'; NEW.iot_trigger_type := OLD.iot_trigger_type; END IF;
  IF NEW.iot_deceleration_g IS DISTINCT FROM OLD.iot_deceleration_g THEN denied := denied || 'iot_deceleration_g'; NEW.iot_deceleration_g := OLD.iot_deceleration_g; END IF;
  IF NEW.iot_impact_severity IS DISTINCT FROM OLD.iot_impact_severity THEN denied := denied || 'iot_impact_severity'; NEW.iot_impact_severity := OLD.iot_impact_severity; END IF;
  IF NEW.iot_speed_at_impact IS DISTINCT FROM OLD.iot_speed_at_impact THEN denied := denied || 'iot_speed_at_impact'; NEW.iot_speed_at_impact := OLD.iot_speed_at_impact; END IF;
  IF NEW.iot_triggered_at IS DISTINCT FROM OLD.iot_triggered_at THEN denied := denied || 'iot_triggered_at'; NEW.iot_triggered_at := OLD.iot_triggered_at; END IF;
  IF NEW.is_late_report IS DISTINCT FROM OLD.is_late_report THEN denied := denied || 'is_late_report'; NEW.is_late_report := OLD.is_late_report; END IF;
  IF NEW.actual_downtime_hours IS DISTINCT FROM OLD.actual_downtime_hours THEN denied := denied || 'actual_downtime_hours'; NEW.actual_downtime_hours := OLD.actual_downtime_hours; END IF;
  IF NEW.estimated_downtime_hours IS DISTINCT FROM OLD.estimated_downtime_hours THEN denied := denied || 'estimated_downtime_hours'; NEW.estimated_downtime_hours := OLD.estimated_downtime_hours; END IF;
  IF NEW.reported_at IS DISTINCT FROM OLD.reported_at THEN denied := denied || 'reported_at'; NEW.reported_at := OLD.reported_at; END IF;
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
  IF NEW.incident_type IS DISTINCT FROM OLD.incident_type THEN denied := denied || 'incident_type'; NEW.incident_type := OLD.incident_type; END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('vehicle_incidents', OLD.id::text,
      'Non-admin/non-support attempted to change severity, IoT data, or resolution fields on incident',
      denied, vals);
    RAISE NOTICE 'Blocked update to protected vehicle_incidents fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- weekly_inspection_reports -------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_weekly_report_column_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid    uuid   := auth.uid();
  denied text[] := '{}';
  vals   jsonb  := '{}'::jsonb;
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF uid = OLD.driver_id AND uid <> COALESCE(OLD.owner_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF NEW.owner_reviewed_at IS DISTINCT FROM OLD.owner_reviewed_at THEN denied := denied || 'owner_reviewed_at'; NEW.owner_reviewed_at := OLD.owner_reviewed_at; END IF;
    IF NEW.owner_notes IS DISTINCT FROM OLD.owner_notes THEN denied := denied || 'owner_notes'; NEW.owner_notes := OLD.owner_notes; END IF;
    IF NEW.owner_action IS DISTINCT FROM OLD.owner_action THEN denied := denied || 'owner_action'; vals := vals || jsonb_build_object('owner_action', NEW.owner_action); NEW.owner_action := OLD.owner_action; END IF;
    IF NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at THEN denied := denied || 'admin_reviewed_at'; NEW.admin_reviewed_at := OLD.admin_reviewed_at; END IF;
    IF NEW.admin_decision IS DISTINCT FROM OLD.admin_decision THEN denied := denied || 'admin_decision'; NEW.admin_decision := OLD.admin_decision; END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN denied := denied || 'admin_notes'; NEW.admin_notes := OLD.admin_notes; END IF;
    IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN denied := denied || 'admin_id'; NEW.admin_id := OLD.admin_id; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.week_start_date IS DISTINCT FROM OLD.week_start_date THEN denied := denied || 'week_start_date'; NEW.week_start_date := OLD.week_start_date; END IF;

  ELSIF uid = OLD.owner_id THEN
    IF NEW.photo_front_view IS DISTINCT FROM OLD.photo_front_view THEN denied := denied || 'photo_front_view'; NEW.photo_front_view := OLD.photo_front_view; END IF;
    IF NEW.photo_back_view IS DISTINCT FROM OLD.photo_back_view THEN denied := denied || 'photo_back_view'; NEW.photo_back_view := OLD.photo_back_view; END IF;
    IF NEW.photo_driver_side IS DISTINCT FROM OLD.photo_driver_side THEN denied := denied || 'photo_driver_side'; NEW.photo_driver_side := OLD.photo_driver_side; END IF;
    IF NEW.photo_passenger_side IS DISTINCT FROM OLD.photo_passenger_side THEN denied := denied || 'photo_passenger_side'; NEW.photo_passenger_side := OLD.photo_passenger_side; END IF;
    IF NEW.photo_front_right_tyre IS DISTINCT FROM OLD.photo_front_right_tyre THEN denied := denied || 'photo_front_right_tyre'; NEW.photo_front_right_tyre := OLD.photo_front_right_tyre; END IF;
    IF NEW.photo_front_left_tyre IS DISTINCT FROM OLD.photo_front_left_tyre THEN denied := denied || 'photo_front_left_tyre'; NEW.photo_front_left_tyre := OLD.photo_front_left_tyre; END IF;
    IF NEW.photo_back_left_tyre IS DISTINCT FROM OLD.photo_back_left_tyre THEN denied := denied || 'photo_back_left_tyre'; NEW.photo_back_left_tyre := OLD.photo_back_left_tyre; END IF;
    IF NEW.photo_back_right_tyre IS DISTINCT FROM OLD.photo_back_right_tyre THEN denied := denied || 'photo_back_right_tyre'; NEW.photo_back_right_tyre := OLD.photo_back_right_tyre; END IF;
    IF NEW.photo_dashboard IS DISTINCT FROM OLD.photo_dashboard THEN denied := denied || 'photo_dashboard'; NEW.photo_dashboard := OLD.photo_dashboard; END IF;
    IF NEW.photo_interior IS DISTINCT FROM OLD.photo_interior THEN denied := denied || 'photo_interior'; NEW.photo_interior := OLD.photo_interior; END IF;
    IF NEW.photo_rideshare_profile IS DISTINCT FROM OLD.photo_rideshare_profile THEN denied := denied || 'photo_rideshare_profile'; NEW.photo_rideshare_profile := OLD.photo_rideshare_profile; END IF;
    IF NEW.photo_timestamps IS DISTINCT FROM OLD.photo_timestamps THEN denied := denied || 'photo_timestamps'; NEW.photo_timestamps := OLD.photo_timestamps; END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN denied := denied || 'submitted_at'; NEW.submitted_at := OLD.submitted_at; END IF;
    IF NEW.driver_responded_at IS DISTINCT FROM OLD.driver_responded_at THEN denied := denied || 'driver_responded_at'; NEW.driver_responded_at := OLD.driver_responded_at; END IF;
    IF NEW.driver_accepted_withdrawal IS DISTINCT FROM OLD.driver_accepted_withdrawal THEN denied := denied || 'driver_accepted_withdrawal'; NEW.driver_accepted_withdrawal := OLD.driver_accepted_withdrawal; END IF;
    IF NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at THEN denied := denied || 'admin_reviewed_at'; NEW.admin_reviewed_at := OLD.admin_reviewed_at; END IF;
    IF NEW.admin_decision IS DISTINCT FROM OLD.admin_decision THEN denied := denied || 'admin_decision'; NEW.admin_decision := OLD.admin_decision; END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN denied := denied || 'admin_notes'; NEW.admin_notes := OLD.admin_notes; END IF;
    IF NEW.admin_id IS DISTINCT FROM OLD.admin_id THEN denied := denied || 'admin_id'; NEW.admin_id := OLD.admin_id; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN denied := denied || 'owner_id'; NEW.owner_id := OLD.owner_id; END IF;
    IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN denied := denied || 'vehicle_id'; NEW.vehicle_id := OLD.vehicle_id; END IF;
    IF NEW.week_start_date IS DISTINCT FROM OLD.week_start_date THEN denied := denied || 'week_start_date'; NEW.week_start_date := OLD.week_start_date; END IF;
  END IF;

  IF array_length(denied, 1) > 0 THEN
    PERFORM public.log_permission_denied('weekly_inspection_reports', OLD.id::text,
      'Non-admin attempted to modify fields outside their role scope on inspection report',
      denied, vals);
    RAISE NOTICE 'Blocked update to protected weekly_inspection_reports fields: %', denied;
  END IF;
  RETURN NEW;
END;
$$;
