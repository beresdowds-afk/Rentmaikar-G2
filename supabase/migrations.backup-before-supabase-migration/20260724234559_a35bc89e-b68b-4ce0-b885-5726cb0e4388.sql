
-- Restrict driver self-update on driver_proxy_billing_accounts to safe columns only.
-- Admin/verification-controlled columns must remain unchanged; only admins may set them.
CREATE OR REPLACE FUNCTION public.enforce_driver_proxy_column_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant') THEN
    RETURN NEW;
  END IF;
  -- For non-admins: freeze admin/verification/status/card columns
  IF NEW.admin_review_status  IS DISTINCT FROM OLD.admin_review_status
     OR NEW.admin_reviewed_by  IS DISTINCT FROM OLD.admin_reviewed_by
     OR NEW.admin_reviewed_at  IS DISTINCT FROM OLD.admin_reviewed_at
     OR NEW.identity_status    IS DISTINCT FROM OLD.identity_status
     OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
     OR NEW.consent_status     IS DISTINCT FROM OLD.consent_status
     OR NEW.card_token         IS DISTINCT FROM OLD.card_token
     OR NEW.card_last4         IS DISTINCT FROM OLD.card_last4
     OR NEW.card_fingerprint   IS DISTINCT FROM OLD.card_fingerprint
     OR NEW.status             IS DISTINCT FROM OLD.status
     OR NEW.activated_at       IS DISTINCT FROM OLD.activated_at
     OR NEW.revoked_at         IS DISTINCT FROM OLD.revoked_at
     OR NEW.revoked_by         IS DISTINCT FROM OLD.revoked_by
  THEN
    RAISE EXCEPTION 'not authorized to modify admin/verification/status/card columns';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_driver_proxy_column_scope ON public.driver_proxy_billing_accounts;
CREATE TRIGGER trg_enforce_driver_proxy_column_scope
  BEFORE UPDATE ON public.driver_proxy_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_proxy_column_scope();

-- Restrict applicant self-update on referee_verifications to non-outcome columns.
CREATE OR REPLACE FUNCTION public.enforce_referee_verification_column_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant') THEN
    RETURN NEW;
  END IF;
  IF NEW.status             IS DISTINCT FROM OLD.status
     OR NEW.attestation_status IS DISTINCT FROM OLD.attestation_status
     OR NEW.attested_at     IS DISTINCT FROM OLD.attested_at
     OR NEW.verified_at     IS DISTINCT FROM OLD.verified_at
     OR NEW.mismatch_reason IS DISTINCT FROM OLD.mismatch_reason
  THEN
    RAISE EXCEPTION 'not authorized to modify referee verification outcome columns';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_referee_verification_column_scope ON public.referee_verifications;
CREATE TRIGGER trg_enforce_referee_verification_column_scope
  BEFORE UPDATE ON public.referee_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_referee_verification_column_scope();
