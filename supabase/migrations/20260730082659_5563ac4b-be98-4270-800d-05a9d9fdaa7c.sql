
-- 1. Referee verification: extend column-scope guard
CREATE OR REPLACE FUNCTION public.enforce_referee_verification_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant') THEN
    RETURN NEW;
  END IF;
  IF NEW.status               IS DISTINCT FROM OLD.status
     OR NEW.attestation_status   IS DISTINCT FROM OLD.attestation_status
     OR NEW.attestation_response IS DISTINCT FROM OLD.attestation_response
     OR NEW.attestation_comments IS DISTINCT FROM OLD.attestation_comments
     OR NEW.attestation_token    IS DISTINCT FROM OLD.attestation_token
     OR NEW.attested_at          IS DISTINCT FROM OLD.attested_at
     OR NEW.verified_at          IS DISTINCT FROM OLD.verified_at
     OR NEW.mismatch_reason      IS DISTINCT FROM OLD.mismatch_reason
     OR NEW.persona_inquiry_id   IS DISTINCT FROM OLD.persona_inquiry_id
     OR NEW.user_id              IS DISTINCT FROM OLD.user_id
     OR NEW.application_id       IS DISTINCT FROM OLD.application_id
  THEN
    RAISE EXCEPTION 'not authorized to modify referee verification outcome columns';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Policy-level column locks (defense in depth alongside triggers)
DROP POLICY IF EXISTS "Users update own referee verifications" ON public.referee_verifications;
CREATE POLICY "Users update own referee verifications"
ON public.referee_verifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.referee_verifications old
    WHERE old.id = referee_verifications.id
      AND old.status               IS NOT DISTINCT FROM referee_verifications.status
      AND old.attestation_status   IS NOT DISTINCT FROM referee_verifications.attestation_status
      AND old.attestation_response IS NOT DISTINCT FROM referee_verifications.attestation_response
      AND old.attestation_token    IS NOT DISTINCT FROM referee_verifications.attestation_token
      AND old.attested_at          IS NOT DISTINCT FROM referee_verifications.attested_at
      AND old.verified_at          IS NOT DISTINCT FROM referee_verifications.verified_at
      AND old.mismatch_reason      IS NOT DISTINCT FROM referee_verifications.mismatch_reason
      AND old.persona_inquiry_id   IS NOT DISTINCT FROM referee_verifications.persona_inquiry_id
      AND old.user_id              IS NOT DISTINCT FROM referee_verifications.user_id
      AND old.application_id       IS NOT DISTINCT FROM referee_verifications.application_id
  )
);

DROP POLICY IF EXISTS "Driver updates own pending proxy" ON public.driver_proxy_billing_accounts;
CREATE POLICY "Driver updates own pending proxy"
ON public.driver_proxy_billing_accounts
FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id AND status = 'pending')
WITH CHECK (
  auth.uid() = driver_id
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.driver_proxy_billing_accounts old
    WHERE old.id = driver_proxy_billing_accounts.id
      AND old.driver_id           IS NOT DISTINCT FROM driver_proxy_billing_accounts.driver_id
      AND old.status              IS NOT DISTINCT FROM driver_proxy_billing_accounts.status
      AND old.admin_review_status IS NOT DISTINCT FROM driver_proxy_billing_accounts.admin_review_status
      AND old.admin_reviewed_by   IS NOT DISTINCT FROM driver_proxy_billing_accounts.admin_reviewed_by
      AND old.admin_reviewed_at   IS NOT DISTINCT FROM driver_proxy_billing_accounts.admin_reviewed_at
      AND old.admin_review_notes  IS NOT DISTINCT FROM driver_proxy_billing_accounts.admin_review_notes
      AND old.identity_status     IS NOT DISTINCT FROM driver_proxy_billing_accounts.identity_status
      AND old.identity_verified_at IS NOT DISTINCT FROM driver_proxy_billing_accounts.identity_verified_at
      AND old.persona_inquiry_id  IS NOT DISTINCT FROM driver_proxy_billing_accounts.persona_inquiry_id
      AND old.consent_status      IS NOT DISTINCT FROM driver_proxy_billing_accounts.consent_status
      AND old.consent_signed_at   IS NOT DISTINCT FROM driver_proxy_billing_accounts.consent_signed_at
      AND old.consent_signature   IS NOT DISTINCT FROM driver_proxy_billing_accounts.consent_signature
      AND old.consent_token       IS NOT DISTINCT FROM driver_proxy_billing_accounts.consent_token
      AND old.consent_token_expires_at IS NOT DISTINCT FROM driver_proxy_billing_accounts.consent_token_expires_at
      AND old.card_provider       IS NOT DISTINCT FROM driver_proxy_billing_accounts.card_provider
      AND old.card_token          IS NOT DISTINCT FROM driver_proxy_billing_accounts.card_token
      AND old.card_last4          IS NOT DISTINCT FROM driver_proxy_billing_accounts.card_last4
      AND old.card_brand          IS NOT DISTINCT FROM driver_proxy_billing_accounts.card_brand
      AND old.card_fingerprint    IS NOT DISTINCT FROM driver_proxy_billing_accounts.card_fingerprint
      AND old.uses_count          IS NOT DISTINCT FROM driver_proxy_billing_accounts.uses_count
      AND old.validity_starts_at  IS NOT DISTINCT FROM driver_proxy_billing_accounts.validity_starts_at
      AND old.validity_expires_at IS NOT DISTINCT FROM driver_proxy_billing_accounts.validity_expires_at
      AND old.activated_at        IS NOT DISTINCT FROM driver_proxy_billing_accounts.activated_at
      AND old.expired_at          IS NOT DISTINCT FROM driver_proxy_billing_accounts.expired_at
      AND old.revoked_at          IS NOT DISTINCT FROM driver_proxy_billing_accounts.revoked_at
      AND old.revoked_by          IS NOT DISTINCT FROM driver_proxy_billing_accounts.revoked_by
  )
);

-- 3. Also lock these extra columns in the proxy trigger guard
CREATE OR REPLACE FUNCTION public.enforce_driver_proxy_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant') THEN
    RETURN NEW;
  END IF;
  IF NEW.admin_review_status  IS DISTINCT FROM OLD.admin_review_status
     OR NEW.admin_reviewed_by  IS DISTINCT FROM OLD.admin_reviewed_by
     OR NEW.admin_reviewed_at  IS DISTINCT FROM OLD.admin_reviewed_at
     OR NEW.admin_review_notes IS DISTINCT FROM OLD.admin_review_notes
     OR NEW.identity_status    IS DISTINCT FROM OLD.identity_status
     OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
     OR NEW.persona_inquiry_id IS DISTINCT FROM OLD.persona_inquiry_id
     OR NEW.consent_status     IS DISTINCT FROM OLD.consent_status
     OR NEW.consent_signed_at  IS DISTINCT FROM OLD.consent_signed_at
     OR NEW.consent_signature  IS DISTINCT FROM OLD.consent_signature
     OR NEW.card_token         IS DISTINCT FROM OLD.card_token
     OR NEW.card_last4         IS DISTINCT FROM OLD.card_last4
     OR NEW.card_brand         IS DISTINCT FROM OLD.card_brand
     OR NEW.card_provider      IS DISTINCT FROM OLD.card_provider
     OR NEW.card_fingerprint   IS DISTINCT FROM OLD.card_fingerprint
     OR NEW.uses_count         IS DISTINCT FROM OLD.uses_count
     OR NEW.validity_starts_at IS DISTINCT FROM OLD.validity_starts_at
     OR NEW.validity_expires_at IS DISTINCT FROM OLD.validity_expires_at
     OR NEW.driver_id          IS DISTINCT FROM OLD.driver_id
     OR NEW.status             IS DISTINCT FROM OLD.status
     OR NEW.activated_at       IS DISTINCT FROM OLD.activated_at
     OR NEW.expired_at         IS DISTINCT FROM OLD.expired_at
     OR NEW.revoked_at         IS DISTINCT FROM OLD.revoked_at
     OR NEW.revoked_by         IS DISTINCT FROM OLD.revoked_by
  THEN
    RAISE EXCEPTION 'not authorized to modify admin/verification/status/card columns';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Revoke anonymous EXECUTE on SECURITY DEFINER functions that are not
--    part of a public/pre-auth flow. Trigger functions never need grants.
REVOKE EXECUTE ON FUNCTION public.enforce_driver_proxy_column_scope() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_referee_verification_column_scope() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_iot_order_official_price() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_review_persona_inquiry(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_search_persona_users(text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_application(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_identity_verification() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_review_persona_inquiry(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_persona_users(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_application(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_identity_verification() TO authenticated;
