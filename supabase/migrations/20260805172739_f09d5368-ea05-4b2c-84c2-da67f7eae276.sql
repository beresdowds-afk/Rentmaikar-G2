-- 1) Shared, idempotent provisioning routine ------------------------------
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
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'provision_user_account requires a user id' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role, text) TO service_role;

-- 2) handle_new_user: stop swallowing errors, honour requested role --------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(
    meta->>'full_name',
    meta->>'name',
    NULLIF(TRIM(CONCAT(meta->>'given_name', ' ', meta->>'family_name')), ''),
    NULL
  );
  v_avatar text := COALESCE(meta->>'avatar_url', meta->>'picture');
  v_phone text := COALESCE(NEW.phone, meta->>'phone');
  v_locale text := COALESCE(meta->>'locale', '');
  v_country text := CASE
    WHEN v_locale ILIKE '%-NG' OR v_locale ILIKE 'ng%' THEN 'NG'
    WHEN v_locale ILIKE '%-US' OR v_locale ILIKE 'en-US' THEN 'US'
    ELSE NULL
  END;
  v_email text := COALESCE(NEW.email, meta->>'email');
  v_email_verified boolean := COALESCE(
    (meta->>'email_verified')::boolean,
    NEW.email_confirmed_at IS NOT NULL,
    false
  );
  v_is_admin_seed boolean := lower(COALESCE(v_email, '')) = 'eastfortemain@gmail.com';
  v_requested text := lower(COALESCE(meta->>'requested_role', ''));
  v_seed_role public.app_role;
  v_onboarding_state jsonb := jsonb_build_object(
    'driver',   jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'renter',   jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'two_factor', jsonb_build_object('status', 'pending', 'enabled', false),
    'notifications', jsonb_build_object('initialized', true),
    'preferences', jsonb_build_object('initialized', true, 'region_mode', 'auto')
  );
BEGIN
  -- 1) Profile (idempotent; existing rows keep their non-null values)
  INSERT INTO public.profiles (
    user_id, email, full_name, phone, avatar_url,
    preferred_country, region_mode,
    notification_email, notification_sms, notification_whatsapp,
    email_verified, onboarding_state
  )
  VALUES (
    NEW.id, v_email, NULLIF(v_full_name, ''), v_phone, v_avatar,
    v_country, 'auto',
    true, false, false,
    v_email_verified, v_onboarding_state
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email             = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name         = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone             = COALESCE(public.profiles.phone, EXCLUDED.phone),
        avatar_url        = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        preferred_country = COALESCE(public.profiles.preferred_country, EXCLUDED.preferred_country),
        region_mode       = COALESCE(public.profiles.region_mode, EXCLUDED.region_mode),
        email_verified    = public.profiles.email_verified OR EXCLUDED.email_verified,
        onboarding_state  = COALESCE(NULLIF(public.profiles.onboarding_state, '{}'::jsonb), EXCLUDED.onboarding_state);

  -- 2) Default role: admin seed > requested role from signup metadata > driver
  IF v_is_admin_seed THEN
    v_seed_role := 'admin';
  ELSIF v_requested IN ('driver', 'owner') THEN
    v_seed_role := v_requested::public.app_role;
  ELSE
    v_seed_role := 'driver';
  END IF;

  IF v_is_admin_seed OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_seed_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- 3) Two-factor settings row — non-critical, must never block signup.
  BEGIN
    INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel, phone_number)
    VALUES (NEW.id, false, v_is_admin_seed, 'sms', CASE WHEN v_phone ~ '^\+[1-9][0-9]{6,14}$' THEN v_phone ELSE NULL END)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: two_factor_settings skipped for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;

  -- 4) Wallet for driver/owner — non-critical at signup, ensured again on approval.
  BEGIN
    IF v_seed_role IN ('driver', 'owner') THEN
      INSERT INTO public.wallet_accounts (user_id, account_type, currency)
      VALUES (NEW.id, v_seed_role::text,
              CASE WHEN upper(COALESCE(v_country, '')) = 'NG' THEN 'NGN' ELSE 'USD' END)
      ON CONFLICT (user_id, account_type, currency) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: wallet skipped for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Profile / role creation is critical: fail loudly instead of leaving a
  -- half-provisioned account behind a successful-looking signup.
  RAISE EXCEPTION 'Account setup failed (%): %', SQLSTATE, SQLERRM
    USING ERRCODE = SQLSTATE, HINT = 'handle_new_user could not provision profile/role for ' || NEW.id::text;
END;
$$;

-- 3) approve_application: resolve missing user link, always provision -------
CREATE OR REPLACE FUNCTION public.approve_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_role app_role;
  v_uid uuid := auth.uid();
  v_authorized boolean := false;
  v_user_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    v_authorized := true;
  ELSE
    SELECT COALESCE(can_approve_applications, false) INTO v_authorized
      FROM public.admin_assistant_permissions
      WHERE user_id = v_uid;
    v_authorized := COALESCE(v_authorized, false);
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to approve applications' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = _app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  v_user_id := v_app.user_id;

  -- Recover the account link by email when the application was created
  -- before / outside the authenticated signup path.
  IF v_user_id IS NULL AND v_app.email IS NOT NULL THEN
    SELECT p.user_id INTO v_user_id
      FROM public.profiles p
     WHERE lower(p.email) = lower(v_app.email)
     ORDER BY p.created_at
     LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Application has no linked auth user. Applicant must create an account first.'
      USING ERRCODE = '22023';
  END IF;

  v_role := CASE v_app.application_type::text
    WHEN 'driver' THEN 'driver'::app_role
    WHEN 'owner' THEN 'owner'::app_role
    ELSE NULL
  END;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Unsupported application_type: %', v_app.application_type;
  END IF;

  UPDATE public.applications
    SET status = 'approved',
        user_id = v_user_id,
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_notes = COALESCE(_notes, review_notes),
        updated_at = now()
    WHERE id = _app_id;

  PERFORM public.provision_user_account(v_user_id, v_role, v_app.email);

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_approved', 'applications', _app_id::text,
          jsonb_build_object('user_id', v_user_id, 'role', v_role, 'notes', _notes,
                             'by_assistant', NOT public.is_admin(),
                             'user_link_recovered', v_app.user_id IS NULL));

  RETURN v_user_id;
END;
$$;