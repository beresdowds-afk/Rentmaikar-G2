
-- 1) New assistant permission column
ALTER TABLE public.admin_assistant_permissions
  ADD COLUMN IF NOT EXISTS can_approve_applications boolean NOT NULL DEFAULT false;

-- 2) approve_application: allow admin OR assistant with permission
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

  IF v_app.user_id IS NULL THEN
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
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_notes = COALESCE(_notes, review_notes),
        updated_at = now()
    WHERE id = _app_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_app.user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_approved', 'applications', _app_id::text,
          jsonb_build_object('user_id', v_app.user_id, 'role', v_role, 'notes', _notes,
                             'by_assistant', NOT public.is_admin()));

  RETURN v_app.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid, text) TO authenticated;

-- 3) reject_application RPC for parity (admin or assistant with permission)
CREATE OR REPLACE FUNCTION public.reject_application(_app_id uuid, _reason text, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_authorized boolean := false;
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
    RAISE EXCEPTION 'Not authorized to reject applications' USING ERRCODE = '42501';
  END IF;

  UPDATE public.applications
    SET status = 'rejected',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_notes = COALESCE(_notes, review_notes),
        rejection_reason = _reason,
        updated_at = now()
    WHERE id = _app_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_rejected', 'applications', _app_id::text,
          jsonb_build_object('reason', _reason, 'notes', _notes,
                             'by_assistant', NOT public.is_admin()));
END;
$$;

REVOKE ALL ON FUNCTION public.reject_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_application(uuid, text, text) TO authenticated;

-- 4) Enrich handle_new_user to seed profile from signup metadata (Google/phone/email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := COALESCE(
    meta->>'full_name',
    meta->>'name',
    TRIM(CONCAT(meta->>'given_name', ' ', meta->>'family_name')),
    NULL
  );
  v_avatar text := COALESCE(meta->>'avatar_url', meta->>'picture');
  v_phone text := COALESCE(NEW.phone, meta->>'phone');
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, phone, avatar_url)
  VALUES (NEW.id, NEW.email, NULLIF(v_full_name, ''), v_phone, v_avatar)
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);
  RETURN NEW;
END;
$$;

-- 5) Simple platform key/value settings for admin toggles (phone OTP provider, etc.)
CREATE TABLE IF NOT EXISTS public.platform_kv_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_kv_settings TO anon, authenticated;
GRANT ALL ON public.platform_kv_settings TO service_role;

ALTER TABLE public.platform_kv_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read platform kv" ON public.platform_kv_settings;
CREATE POLICY "Anyone can read platform kv" ON public.platform_kv_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage platform kv" ON public.platform_kv_settings;
CREATE POLICY "Admins manage platform kv" ON public.platform_kv_settings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.platform_kv_settings (key, value)
VALUES ('phone_otp_provider', jsonb_build_object('provider', 'supabase'))
ON CONFLICT (key) DO NOTHING;
