CREATE OR REPLACE FUNCTION public.get_onboarding_next_step()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _s text;
  _done boolean;
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

  SELECT COALESCE(p.phone_verified, false),
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

  FOREACH _s IN ARRAY _steps LOOP
    _done := CASE _s
      WHEN 'email_verification' THEN _email_verified
      WHEN 'phone_verification' THEN _phone_verified
      WHEN 'identity' THEN _identity_ok
      WHEN 'application' THEN _app_status IS NOT NULL
      WHEN 'legal' THEN _has_legal
      WHEN 'training' THEN _has_training
      WHEN 'vehicle' THEN _has_vehicle
      WHEN 'two_factor' THEN _two_fa
      ELSE false
    END;
    IF _done THEN
      _completed := _completed || _s;
    ELSIF _next = 'done' THEN
      _next := _s;
      _next_href := COALESCE(_hrefs->>_s, '/');
    END IF;
  END LOOP;

  IF array_length(_steps,1) > 0 THEN
    _pct := (COALESCE(array_length(_completed,1),0) * 100) / array_length(_steps,1);
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'role', _role,
    'steps', to_jsonb(_steps),
    'labels', _labels,
    'hrefs', _hrefs,
    'completed', to_jsonb(_completed),
    'next_step', _next,
    'next_href', CASE WHEN _next = 'done' THEN COALESCE(_last_visited, '/') ELSE _next_href END,
    'percent', _pct,
    'application_status', _app_status,
    'last_visited_step', _last_visited
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_onboarding_next_step() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_next_step() TO authenticated;