
CREATE OR REPLACE FUNCTION public.get_onboarding_next_step()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role text;
  _email_verified boolean := false;
  _phone_verified boolean := false;
  _identity_ok boolean := false;
  _has_legal boolean := false;
  _has_training boolean := false;
  _has_vehicle boolean := false;
  _two_fa boolean := false;
  _app_status text;
  _last_visited text;
  _steps text[] := ARRAY[]::text[];
  _completed text[] := ARRAY[]::text[];
  _labels jsonb := '{}'::jsonb;
  _hrefs jsonb := '{}'::jsonb;
  _next text := 'done';
  _next_href text := '/';
  _pct int := 0;
  _base text;
  _is_staff boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'next_step', 'sign_in',
                              'next_href', '/auth', 'completed', '[]'::jsonb, 'percent', 0);
  END IF;

  SELECT ur.role::text INTO _role FROM public.user_roles ur
   WHERE ur.user_id = _uid
   ORDER BY CASE ur.role::text
     WHEN 'admin' THEN 1
     WHEN 'admin_assistant' THEN 2
     WHEN 'driver' THEN 3
     WHEN 'owner' THEN 4
     ELSE 5 END
   LIMIT 1;

  _is_staff := _role IN ('admin','admin_assistant','legal_support','iot_support','vehicle_support');

  SELECT (u.email_confirmed_at IS NOT NULL) INTO _email_verified
    FROM auth.users u WHERE u.id = _uid;

  SELECT (p.phone_verified_at IS NOT NULL),
         (p.identity_verification_status = 'completed' OR p.identity_verified_at IS NOT NULL),
         p.onboarding_state->>'last_visited_step'
    INTO _phone_verified, _identity_ok, _last_visited
    FROM public.profiles p WHERE p.user_id = _uid;

  SELECT COALESCE(t.is_enabled AND t.verified_at IS NOT NULL, false) INTO _two_fa
    FROM public.two_factor_settings t WHERE t.user_id = _uid;

  SELECT status INTO _app_status FROM public.applications
   WHERE user_id = _uid ORDER BY created_at DESC LIMIT 1;

  SELECT EXISTS(SELECT 1 FROM public.legal_agreement_acceptances WHERE user_id = _uid)
    INTO _has_legal;

  IF _role = 'driver' THEN
    SELECT EXISTS(SELECT 1 FROM public.training_completions WHERE user_id = _uid)
      INTO _has_training;
    _base := '/driver/onboarding';
    _steps := ARRAY['email_verification','phone_verification','identity','application','legal','training'];
    _labels := jsonb_build_object(
      'email_verification','Verify your email',
      'phone_verification','Verify your phone',
      'identity','Complete identity verification',
      'application','Submit driver application',
      'legal','Accept legal agreements',
      'training','Complete driver training'
    );
    _hrefs := jsonb_build_object(
      'email_verification','/verify-email',
      'phone_verification', _base||'?step=phone',
      'identity', _base||'?step=verification',
      'application','/driver/registration',
      'legal', _base||'?step=legal',
      'training','/driver/training'
    );
  ELSIF _role = 'owner' THEN
    SELECT EXISTS(SELECT 1 FROM public.vehicles WHERE user_id = _uid) INTO _has_vehicle;
    _base := '/owner/onboarding';
    _steps := ARRAY['email_verification','phone_verification','identity','application','legal','vehicle'];
    _labels := jsonb_build_object(
      'email_verification','Verify your email',
      'phone_verification','Verify your phone',
      'identity','Complete identity verification',
      'application','Submit owner application',
      'legal','Accept legal agreements',
      'vehicle','List your first vehicle'
    );
    _hrefs := jsonb_build_object(
      'email_verification','/verify-email',
      'phone_verification', _base||'?step=phone',
      'identity', _base||'?step=verification',
      'application','/owner/registration',
      'legal', _base||'?step=legal',
      'vehicle','/owner/dashboard?tab=vehicles'
    );
  ELSIF _is_staff THEN
    -- Admin & support staff: created by an admin, so guide password + 2FA setup.
    _steps := ARRAY['email_verification','two_factor'];
    _labels := jsonb_build_object(
      'email_verification','Verify your email',
      'two_factor','Enable two-factor authentication'
    );
    _hrefs := jsonb_build_object(
      'email_verification','/verify-email',
      'two_factor','/profile/settings?tab=security'
    );
  ELSE
    _steps := ARRAY['email_verification'];
    _labels := jsonb_build_object('email_verification','Verify your email');
    _hrefs := jsonb_build_object('email_verification','/verify-email');
  END IF;

  IF _email_verified THEN _completed := _completed || 'email_verification'; END IF;
  IF _phone_verified THEN _completed := _completed || 'phone_verification'; END IF;
  IF _identity_ok THEN _completed := _completed || 'identity'; END IF;
  IF _app_status = 'approved' THEN _completed := _completed || 'application'; END IF;
  IF _has_legal THEN _completed := _completed || 'legal'; END IF;
  IF _role = 'driver' AND _has_training THEN _completed := _completed || 'training'; END IF;
  IF _role = 'owner' AND _has_vehicle THEN _completed := _completed || 'vehicle'; END IF;
  IF _is_staff AND _two_fa THEN _completed := _completed || 'two_factor'; END IF;

  DECLARE _s text;
  BEGIN
    FOREACH _s IN ARRAY _steps LOOP
      IF NOT (_s = ANY(_completed)) THEN
        _next := _s;
        _next_href := COALESCE(_hrefs->>_s, '/');
        EXIT;
      END IF;
    END LOOP;
  END;

  _pct := (COALESCE(array_length(_completed,1),0) * 100) / GREATEST(array_length(_steps,1),1);
  IF _pct IS NULL THEN _pct := 0; END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'role', _role,
    'next_step', _next,
    'next_href', _next_href,
    'completed', to_jsonb(_completed),
    'steps', to_jsonb(_steps),
    'labels', _labels,
    'hrefs', _hrefs,
    'percent', _pct,
    'last_visited_step', _last_visited,
    'two_factor_enabled', _two_fa,
    'application_status', _app_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_next_step() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_next_step() TO authenticated;
