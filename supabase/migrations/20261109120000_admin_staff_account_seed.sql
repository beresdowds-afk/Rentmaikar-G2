-- Only service-controlled app metadata may suppress the public account type.
-- Public user_metadata is deliberately not trusted for staff provisioning.
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
  v_requested text := lower(COALESCE(meta->>'requested_role', ''));
  v_seed_role public.app_role;
  v_onboarding_state jsonb := jsonb_build_object(
    'driver', jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'renter', jsonb_build_object('status', 'pending', 'started_at', NULL, 'completed_at', NULL),
    'two_factor', jsonb_build_object('status', 'pending', 'enabled', false),
    'notifications', jsonb_build_object('initialized', true),
    'preferences', jsonb_build_object('initialized', true, 'region_mode', 'auto')
  );
BEGIN
  v_phone := NULLIF(regexp_replace(COALESCE(v_phone_raw, ''), '[^0-9]', '', 'g'), '');
  IF v_phone IS NOT NULL THEN
    v_phone := '+' || v_phone;
    IF v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
      v_phone := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (
    user_id, email, full_name, phone, avatar_url,
    preferred_country, region_mode,
    notification_email, notification_sms, notification_whatsapp,
    email_verified, onboarding_state
  )
  VALUES (
    NEW.id, v_email, NULLIF(v_full_name, ''), v_phone, v_avatar,
    v_country, 'auto', true, false, false,
    v_email_verified, v_onboarding_state
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
        preferred_country = COALESCE(public.profiles.preferred_country, EXCLUDED.preferred_country),
        region_mode = COALESCE(public.profiles.region_mode, EXCLUDED.region_mode),
        email_verified = public.profiles.email_verified OR EXCLUDED.email_verified,
        onboarding_state = COALESCE(
          NULLIF(public.profiles.onboarding_state, '{}'::jsonb), EXCLUDED.onboarding_state
        );

  IF COALESCE(NEW.raw_app_meta_data->>'admin_staff_creation', '') <> 'true' THEN
    v_seed_role := CASE
      WHEN v_requested IN ('driver', 'owner') THEN v_requested::public.app_role
      ELSE 'driver'::public.app_role
    END;
    PERFORM public.provision_user_account(NEW.id, v_seed_role, v_email);
  END IF;

  BEGIN
    INSERT INTO public.two_factor_settings (
      user_id, is_enabled, is_mandatory, preferred_channel, phone_number
    )
    VALUES (NEW.id, false, false, 'sms', v_phone)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: two_factor_settings skipped for %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;
