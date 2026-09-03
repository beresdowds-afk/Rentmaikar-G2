
-- Harden the new-user onboarding pipeline to initialize every per-user
-- record in one transactional trigger. All inserts are idempotent so
-- retries / re-signins never create duplicates.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 2) Default role (admin seed, otherwise driver)
  IF v_is_admin_seed THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'driver')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- 3) Two-factor settings row (disabled by default; mandatory later for admins/owners)
  INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel, phone_number)
  VALUES (NEW.id, false, v_is_admin_seed, 'sms', CASE WHEN v_phone ~ '^\+[1-9][0-9]{6,14}$' THEN v_phone ELSE NULL END)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth.users insert — surface via NOTICE and let sign-in complete.
  RAISE WARNING 'handle_new_user failed for %: % (%). Onboarding rows will be backfilled on next login.', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- Backfill any existing users missing initialization rows.
INSERT INTO public.profiles (user_id, email, notification_email, notification_sms, notification_whatsapp, region_mode, onboarding_state)
SELECT u.id, u.email, true, false, false, 'auto',
  jsonb_build_object(
    'driver',   jsonb_build_object('status', 'pending'),
    'renter',   jsonb_build_object('status', 'pending'),
    'two_factor', jsonb_build_object('status', 'pending', 'enabled', false),
    'notifications', jsonb_build_object('initialized', true),
    'preferences', jsonb_build_object('initialized', true, 'region_mode', 'auto')
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel)
SELECT u.id, false, false, 'sms'
FROM auth.users u
LEFT JOIN public.two_factor_settings t ON t.user_id = u.id
WHERE t.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
