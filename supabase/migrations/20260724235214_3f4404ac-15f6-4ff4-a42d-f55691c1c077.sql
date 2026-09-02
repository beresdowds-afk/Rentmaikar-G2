-- Treat Google-verified (or otherwise auth-confirmed) emails as verified in
-- registration progress, and backfill profiles.email_verified from auth.users
-- so email/password users still go through the classic verification path but
-- OAuth users skip it automatically.

CREATE OR REPLACE FUNCTION public.get_my_registration_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _stage public.registration_stage_enum;
  _access public.access_level_enum;
  _role text;
  _email_verified boolean;
  _auth_confirmed_at timestamptz;
  _auth_provider text;
  _auth_meta jsonb;
  _identity_status text;
  _identity_at timestamptz;
  _doc_count int;
  _referee_verified int;
  _app_status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT p.registration_stage, p.access_level, p.email_verified,
         p.identity_verification_status, p.identity_verified_at
    INTO _stage, _access, _email_verified, _identity_status, _identity_at
    FROM public.profiles p WHERE p.user_id = _uid;

  SELECT u.email_confirmed_at,
         COALESCE(u.raw_app_meta_data->>'provider', ''),
         COALESCE(u.raw_user_meta_data, '{}'::jsonb)
    INTO _auth_confirmed_at, _auth_provider, _auth_meta
    FROM auth.users u WHERE u.id = _uid;

  -- OAuth (e.g. Google) accounts arrive with email_confirmed_at + email_verified=true.
  -- Treat any such session as email-verified without requiring a code round-trip.
  IF NOT COALESCE(_email_verified, false) THEN
    IF _auth_confirmed_at IS NOT NULL
       OR COALESCE((_auth_meta->>'email_verified')::boolean, false)
       OR _auth_provider IN ('google','apple','azure','facebook','github') THEN
      _email_verified := true;
      UPDATE public.profiles SET email_verified = true WHERE user_id = _uid;
    END IF;
  END IF;

  SELECT ur.role::text INTO _role FROM public.user_roles ur
   WHERE ur.user_id = _uid AND ur.role IN ('driver','owner') LIMIT 1;

  SELECT count(*) INTO _doc_count FROM public.user_documents
   WHERE user_id = _uid AND (status IS NULL OR status <> 'rejected');

  SELECT count(*) INTO _referee_verified FROM public.referee_verifications
   WHERE user_id = _uid AND verified_at IS NOT NULL;

  SELECT status INTO _app_status FROM public.applications
   WHERE user_id = _uid ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'authenticated', true,
    'stage', COALESCE(_stage::text, 'auth'),
    'access_level', COALESCE(_access::text, 'view_only'),
    'role', _role,
    'email_verified', COALESCE(_email_verified, false),
    'identity_verification_status', _identity_status,
    'identity_verified_at', _identity_at,
    'documents_uploaded', _doc_count,
    'referees_verified', _referee_verified,
    'application_status', _app_status
  );
END;
$function$;

-- Backfill: mark existing OAuth users' profiles as email-verified.
UPDATE public.profiles p
   SET email_verified = true
  FROM auth.users u
 WHERE u.id = p.user_id
   AND COALESCE(p.email_verified, false) = false
   AND (
     u.email_confirmed_at IS NOT NULL
     OR COALESCE((u.raw_user_meta_data->>'email_verified')::boolean, false)
     OR COALESCE(u.raw_app_meta_data->>'provider', '') IN ('google','apple','azure','facebook','github')
   );