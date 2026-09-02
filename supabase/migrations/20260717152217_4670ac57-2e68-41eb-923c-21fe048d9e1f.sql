
CREATE OR REPLACE FUNCTION public.approve_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_role app_role;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may approve applications' USING ERRCODE = '42501';
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
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = COALESCE(_notes, review_notes),
        updated_at = now()
    WHERE id = _app_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_app.user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'application_approved', 'applications', _app_id::text,
          jsonb_build_object('user_id', v_app.user_id, 'role', v_role, 'notes', _notes));

  RETURN v_app.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_application(uuid, text) TO authenticated;
