-- 1) Authorize + expose provision_user_account to signed-in callers
CREATE OR REPLACE FUNCTION public.provision_user_account(
  _user_id uuid,
  _role public.app_role DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_currency text;
  v_caller uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'provision_user_account requires a user id' USING ERRCODE = '22023';
  END IF;

  -- Authorization: service_role (no JWT) is trusted; self-service is limited to
  -- driver/owner; anything else requires admin or a user-managing assistant.
  IF v_caller IS NOT NULL THEN
    IF v_caller = _user_id AND (_role IS NULL OR _role IN ('driver','owner')) THEN
      NULL;
    ELSIF public.is_admin(v_caller) THEN
      NULL;
    ELSIF _role IS DISTINCT FROM 'admin'
      AND public.has_admin_privilege(v_caller, 'can_manage_users') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'not authorized to provision this account'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, email)
  VALUES (_user_id, _email)
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email);

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel)
  VALUES (_user_id, false, false, 'sms')
  ON CONFLICT (user_id) DO NOTHING;

  IF _role IN ('driver', 'owner') THEN
    SELECT preferred_country INTO v_country FROM public.profiles WHERE user_id = _user_id;
    v_currency := CASE WHEN upper(COALESCE(v_country, '')) = 'NG' THEN 'NGN' ELSE 'USD' END;

    INSERT INTO public.wallet_accounts (user_id, account_type, currency)
    VALUES (_user_id, _role::text, v_currency)
    ON CONFLICT (user_id, account_type, currency) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role, text) TO authenticated, service_role;

-- 2) Fix onboarding progress lookup: two_factor_settings has enabled_at, not verified_at
CREATE OR REPLACE FUNCTION public.get_onboarding_next_step()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _email_ok boolean := false;
  _phone_ok boolean := false;
  _identity_ok boolean := false;
  _two_fa boolean := false;
  _role text;
  _next text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT COALESCE(p.email_verified, false),
         COALESCE(p.phone_verified, false),
         COALESCE(p.identity_verification_status = 'completed'
                  OR p.identity_verified_at IS NOT NULL, false)
    INTO _email_ok, _phone_ok, _identity_ok
    FROM public.profiles p
   WHERE p.user_id = _uid;

  SELECT COALESCE(t.is_enabled AND t.enabled_at IS NOT NULL, false)
    INTO _two_fa
    FROM public.two_factor_settings t
   WHERE t.user_id = _uid;

  SELECT ur.role::text INTO _role
    FROM public.user_roles ur
   WHERE ur.user_id = _uid
   LIMIT 1;

  _next := CASE
    WHEN NOT _email_ok THEN 'verify_email'
    WHEN NOT _phone_ok THEN 'verify_phone'
    WHEN NOT _identity_ok THEN 'verify_identity'
    WHEN _role IN ('admin','owner') AND NOT _two_fa THEN 'setup_two_factor'
    ELSE 'complete'
  END;

  RETURN jsonb_build_object(
    'authenticated', true,
    'role', _role,
    'email_verified', _email_ok,
    'phone_verified', _phone_ok,
    'identity_verified', _identity_ok,
    'two_factor_enabled', _two_fa,
    'next_step', _next
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_onboarding_next_step() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_next_step() TO authenticated, service_role;