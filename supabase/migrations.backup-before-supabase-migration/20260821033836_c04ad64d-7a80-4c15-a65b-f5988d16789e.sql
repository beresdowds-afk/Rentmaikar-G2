CREATE OR REPLACE FUNCTION public.profile_privileged_fields_unchanged(_new public.profiles)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old public.profiles%ROWTYPE;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT * INTO _old FROM public.profiles WHERE id = _new.id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN _new.user_id IS NOT DISTINCT FROM _old.user_id
     AND _new.access_level IS NOT DISTINCT FROM _old.access_level
     AND _new.persona_verified IS NOT DISTINCT FROM _old.persona_verified
     AND _new.referee_verified IS NOT DISTINCT FROM _old.referee_verified
     AND _new.payment_proxy_verified IS NOT DISTINCT FROM _old.payment_proxy_verified
     AND _new.identity_verified_at IS NOT DISTINCT FROM _old.identity_verified_at
     AND _new.identity_verification_status IS NOT DISTINCT FROM _old.identity_verification_status
     AND _new.identity_verified_inquiry_id IS NOT DISTINCT FROM _old.identity_verified_inquiry_id
     AND _new.email_verified IS NOT DISTINCT FROM _old.email_verified
     AND _new.phone_verified IS NOT DISTINCT FROM _old.phone_verified
     AND _new.registration_stage IS NOT DISTINCT FROM _old.registration_stage
     AND _new.onboarding_completed_at IS NOT DISTINCT FROM _old.onboarding_completed_at
     AND _new.is_active IS NOT DISTINCT FROM _old.is_active
     AND _new.payments_suspended IS NOT DISTINCT FROM _old.payments_suspended
     AND _new.suspended_reason IS NOT DISTINCT FROM _old.suspended_reason
     AND _new.suspended_until IS NOT DISTINCT FROM _old.suspended_until
     AND _new.suspended_call_in_id IS NOT DISTINCT FROM _old.suspended_call_in_id
     AND _new.daily_plan_forbidden IS NOT DISTINCT FROM _old.daily_plan_forbidden
     AND _new.daily_plan_forbidden_at IS NOT DISTINCT FROM _old.daily_plan_forbidden_at
     AND _new.daily_plan_forbidden_reason IS NOT DISTINCT FROM _old.daily_plan_forbidden_reason
     AND _new.role_change_used IS NOT DISTINCT FROM _old.role_change_used
     AND _new.role_changed_at IS NOT DISTINCT FROM _old.role_changed_at
     AND _new.public_uuid IS NOT DISTINCT FROM _old.public_uuid
     AND _new.username IS NOT DISTINCT FROM _old.username
     AND _new.driver_license_number IS NOT DISTINCT FROM _old.driver_license_number
     AND _new.driver_license_expiry IS NOT DISTINCT FROM _old.driver_license_expiry
     AND _new.onboarding_state IS NOT DISTINCT FROM _old.onboarding_state
     AND _new.profile_completion_skipped_at IS NOT DISTINCT FROM _old.profile_completion_skipped_at
     AND _new.street_address IS NOT DISTINCT FROM _old.street_address
     AND _new.city IS NOT DISTINCT FROM _old.city
     AND _new.emergency_contact_name IS NOT DISTINCT FROM _old.emergency_contact_name
     AND _new.emergency_contact_phone IS NOT DISTINCT FROM _old.emergency_contact_phone
     AND _new.has_payment_method IS NOT DISTINCT FROM _old.has_payment_method
     AND _new.owns_vehicle IS NOT DISTINCT FROM _old.owns_vehicle
     AND _new.data_sharing_consent IS NOT DISTINCT FROM _old.data_sharing_consent
     AND _new.data_sharing_consent_at IS NOT DISTINCT FROM _old.data_sharing_consent_at
     AND _new.cookie_consent IS NOT DISTINCT FROM _old.cookie_consent
     AND _new.cookie_consent_at IS NOT DISTINCT FROM _old.cookie_consent_at
     AND _new.messaging_consent_at IS NOT DISTINCT FROM _old.messaging_consent_at
     AND _new.phone_verification_code IS NOT DISTINCT FROM _old.phone_verification_code
     AND _new.phone_verification_expires_at IS NOT DISTINCT FROM _old.phone_verification_expires_at
     AND _new.persona_notification_frequency IS NOT DISTINCT FROM _old.persona_notification_frequency;
END;
$$;