-- Keep account provisioning behind authenticated server-side authorization.
-- Auth triggers and admin approval functions call this as their owner; the
-- browser uses the authorized Cloud Run provision-user-account route.
REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, public.app_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, public.app_role)
  TO service_role;

-- A verified email address or user_metadata value is not an administrator
-- grant. New public registrations may request only driver or owner roles.
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
    v_country, 'auto',
    true, false, false,
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
          NULLIF(public.profiles.onboarding_state, '{}'::jsonb),
          EXCLUDED.onboarding_state
        );

  v_seed_role := CASE
    WHEN v_requested IN ('driver', 'owner') THEN v_requested::public.app_role
    ELSE 'driver'::public.app_role
  END;

  PERFORM public.provision_user_account(NEW.id, v_seed_role, v_email);

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

CREATE OR REPLACE FUNCTION public.advance_registration_stage(
  _target public.registration_stage_enum
)
RETURNS public.registration_stage_enum
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current public.registration_stage_enum;
  _order integer;
  _target_order integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _target IS NULL OR _target = 'approved' THEN
    RAISE EXCEPTION 'Only an administrator can approve an account' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid AND role IN ('driver', 'owner')
  ) THEN
    RAISE EXCEPTION 'Only driver or owner accounts can advance registration' USING ERRCODE = '42501';
  END IF;

  SELECT registration_stage
    INTO _current
    FROM public.profiles
   WHERE user_id = _uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration profile not found' USING ERRCODE = 'P0002';
  END IF;

  _current := COALESCE(_current, 'auth');
  _order := array_position(
    ARRAY['auth', 'account_opened', 'documents_submitted', 'verification_pending', 'approved']::text[],
    _current::text
  );
  _target_order := array_position(
    ARRAY['auth', 'account_opened', 'documents_submitted', 'verification_pending']::text[],
    _target::text
  );

  IF _target_order IS NULL THEN
    RAISE EXCEPTION 'Invalid registration stage' USING ERRCODE = '22023';
  END IF;

  IF _current = 'approved' OR _target_order <= _order THEN
    RETURN _current;
  END IF;

  UPDATE public.profiles
     SET registration_stage = _target,
         stage_updated_at = now(),
         updated_at = now()
   WHERE user_id = _uid;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _uid, 'stage_advanced',
         jsonb_build_object('from', _current, 'to', _target)
    FROM public.applications a
   WHERE a.user_id = _uid
   ORDER BY a.created_at DESC
   LIMIT 1;

  RETURN _target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_registration_stage(public.registration_stage_enum)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_registration_stage(public.registration_stage_enum)
  TO authenticated;
