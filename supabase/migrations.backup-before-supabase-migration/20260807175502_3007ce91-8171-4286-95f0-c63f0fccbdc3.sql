CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(
    meta->>'full_name',
    meta->>'name',
    NULLIF(TRIM(CONCAT(meta->>'given_name', ' ', meta->>'family_name')), ''),
    NULL
  );
  v_avatar text := COALESCE(meta->>'avatar_url', meta->>'picture');
  v_phone_raw text := COALESCE(NEW.phone, meta->>'phone');
  v_phone text;
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
  -- GoTrue stores auth.users.phone WITHOUT the leading '+', but public.profiles
  -- enforces E.164. Normalise here so phone sign-ups are not rejected.
  v_phone := NULLIF(regexp_replace(COALESCE(v_phone_raw, ''), '[^0-9]', '', 'g'), '');
  IF v_phone IS NOT NULL THEN
    v_phone := '+' || v_phone;
    IF v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
      v_phone := NULL;
    END IF;
  END IF;

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
    VALUES (NEW.id, false, v_is_admin_seed, 'sms', v_phone)
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
  RAISE EXCEPTION 'Account setup failed (%): %', SQLSTATE, SQLERRM
    USING ERRCODE = SQLSTATE, HINT = 'handle_new_user could not provision profile/role for ' || NEW.id::text;
END;
$function$;