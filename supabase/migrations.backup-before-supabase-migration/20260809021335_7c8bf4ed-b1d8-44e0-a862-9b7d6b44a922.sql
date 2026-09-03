CREATE OR REPLACE FUNCTION public.profile_privileged_fields_unchanged(_new public.profiles)
RETURNS boolean
LANGUAGE plpgsql
STABLE
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
     AND _new.daily_plan_forbidden IS NOT DISTINCT FROM _old.daily_plan_forbidden
     AND _new.public_uuid IS NOT DISTINCT FROM _old.public_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_privileged_fields_unchanged(public.profiles) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_privileged_fields_unchanged(public.profiles) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND public.profile_privileged_fields_unchanged(profiles)
);