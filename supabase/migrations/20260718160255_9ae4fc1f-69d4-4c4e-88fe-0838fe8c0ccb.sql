
-- Enums
DO $$ BEGIN
  CREATE TYPE public.registration_stage_enum AS ENUM (
    'auth','account_opened','documents_submitted','verification_pending','approved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_level_enum AS ENUM ('view_only','full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS registration_stage public.registration_stage_enum,
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_level public.access_level_enum NOT NULL DEFAULT 'view_only';

-- Grandfather existing approved users
UPDATE public.profiles p
SET access_level = 'full',
    registration_stage = 'approved',
    stage_updated_at = COALESCE(p.onboarding_completed_at, now())
WHERE p.user_id IN (
  SELECT user_id FROM public.user_roles WHERE role IN ('driver','owner')
)
AND p.onboarding_completed_at IS NOT NULL
AND p.registration_stage IS NULL;

-- Backfill remaining driver/owner profiles to 'account_opened' view_only
UPDATE public.profiles p
SET registration_stage = 'account_opened',
    stage_updated_at = now()
WHERE p.user_id IN (
  SELECT user_id FROM public.user_roles WHERE role IN ('driver','owner')
)
AND p.registration_stage IS NULL;

-- has_full_access helper
CREATE OR REPLACE FUNCTION public.has_full_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_level = 'full' FROM public.profiles WHERE user_id = _user_id),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_full_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_full_access(uuid) TO authenticated, service_role;

-- advance_registration_stage: caller updates their own stage forward
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
  _order int;
  _target_order int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT registration_stage INTO _current FROM public.profiles WHERE user_id = _uid;
  IF _current IS NULL THEN _current := 'auth'; END IF;

  -- Only allow forward transitions up to verification_pending. approved is admin-only.
  IF _target = 'approved' THEN
    RAISE EXCEPTION 'Only admins can grant approval';
  END IF;

  _order := array_position(ARRAY['auth','account_opened','documents_submitted','verification_pending','approved']::text[], _current::text);
  _target_order := array_position(ARRAY['auth','account_opened','documents_submitted','verification_pending','approved']::text[], _target::text);

  IF _target_order < _order THEN
    -- No-op: don't move backwards
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
   WHERE a.applicant_user_id = _uid
   ORDER BY a.created_at DESC
   LIMIT 1;

  RETURN _target;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_registration_stage(public.registration_stage_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_registration_stage(public.registration_stage_enum) TO authenticated;

-- grant_full_access: admin only
CREATE OR REPLACE FUNCTION public.grant_full_access(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can grant full access';
  END IF;

  UPDATE public.profiles
     SET access_level = 'full',
         registration_stage = 'approved',
         stage_updated_at = now(),
         onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
         updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _actor, 'full_access_granted',
         jsonb_build_object('target_user_id', _user_id)
    FROM public.applications a
   WHERE a.applicant_user_id = _user_id
   ORDER BY a.created_at DESC
   LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_full_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_full_access(uuid) TO authenticated;

-- revoke_full_access: admin only, drops user back to view_only
CREATE OR REPLACE FUNCTION public.revoke_full_access(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can revoke access';
  END IF;

  UPDATE public.profiles
     SET access_level = 'view_only',
         registration_stage = 'verification_pending',
         stage_updated_at = now(),
         updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _actor, 'full_access_revoked',
         jsonb_build_object('target_user_id', _user_id, 'reason', _reason)
    FROM public.applications a
   WHERE a.applicant_user_id = _user_id
   ORDER BY a.created_at DESC
   LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_full_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_full_access(uuid, text) TO authenticated;

-- get_my_registration_progress
CREATE OR REPLACE FUNCTION public.get_my_registration_progress()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
   WHERE user_id = _uid AND (verification_status IS NULL OR verification_status <> 'rejected');

  SELECT count(*) INTO _referee_verified FROM public.referee_verifications
   WHERE driver_user_id = _uid AND verified_at IS NOT NULL;

  SELECT status INTO _app_status FROM public.applications
   WHERE applicant_user_id = _uid ORDER BY created_at DESC LIMIT 1;

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
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_registration_progress() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_registration_progress() TO authenticated;
