-- 1) Applications: force safe defaults on self-submitted applications.
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
  ON public.applications FOR INSERT
  WITH CHECK (
    COALESCE(status, 'pending') = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND assigned_to IS NULL
    AND assigned_by IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- 2) Profiles: apply privileged-field guard on INSERT too.
CREATE OR REPLACE FUNCTION public.profile_insert_fields_safe(_new profiles)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN true;
  END IF;

  RETURN COALESCE(_new.access_level, 'basic') IN ('basic', 'none', 'pending')
     AND COALESCE(_new.persona_verified, false) = false
     AND COALESCE(_new.referee_verified, false) = false
     AND COALESCE(_new.payment_proxy_verified, false) = false
     AND _new.identity_verified_at IS NULL
     AND COALESCE(_new.identity_verification_status, 'not_started') IN ('not_started', 'pending', 'unverified')
     AND _new.identity_verified_inquiry_id IS NULL
     AND COALESCE(_new.email_verified, false) = false
     AND COALESCE(_new.phone_verified, false) = false
     AND _new.onboarding_completed_at IS NULL
     AND COALESCE(_new.role_change_used, false) = false
     AND _new.role_changed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_insert_fields_safe(profiles) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_insert_fields_safe(profiles) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.profile_insert_fields_safe(profiles.*)
  );