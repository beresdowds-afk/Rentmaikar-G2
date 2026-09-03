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

-- Diagnostics helper: reports whether required onboarding RPCs & columns exist.
CREATE OR REPLACE FUNCTION public.onboarding_diagnostics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _checks jsonb := '[]'::jsonb;
  _rpc text;
  _col record;
  _exists boolean;
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can run onboarding diagnostics';
  END IF;

  FOR _rpc IN SELECT unnest(ARRAY[
    'get_my_registration_progress',
    'advance_registration_stage',
    'grant_full_access',
    'revoke_full_access',
    'approve_application'
  ]) LOOP
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=_rpc) INTO _exists;
    _checks := _checks || jsonb_build_object('kind','rpc','name',_rpc,'ok',_exists);
  END LOOP;

  FOR _col IN SELECT * FROM (VALUES
    ('profiles','registration_stage'),
    ('profiles','access_level'),
    ('profiles','stage_updated_at'),
    ('profiles','onboarding_completed_at'),
    ('profiles','identity_verification_status'),
    ('profiles','identity_verified_at'),
    ('profiles','email_verified'),
    ('user_documents','user_id'),
    ('user_documents','status'),
    ('applications','user_id'),
    ('applications','status'),
    ('referee_verifications','user_id'),
    ('referee_verifications','verified_at'),
    ('user_roles','role')
  ) v(t,c) LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=_col.t AND column_name=_col.c
    ) INTO _exists;
    _checks := _checks || jsonb_build_object('kind','column','name',_col.t||'.'||_col.c,'ok',_exists);
  END LOOP;

  -- Smoke test: call get_my_registration_progress and capture any error
  BEGIN
    PERFORM public.get_my_registration_progress();
    _checks := _checks || jsonb_build_object('kind','smoke','name','get_my_registration_progress()','ok',true);
  EXCEPTION WHEN OTHERS THEN
    _checks := _checks || jsonb_build_object('kind','smoke','name','get_my_registration_progress()','ok',false,'error',SQLERRM);
  END;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'actor_id', _actor,
    'checks', _checks
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.onboarding_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_diagnostics() TO authenticated;