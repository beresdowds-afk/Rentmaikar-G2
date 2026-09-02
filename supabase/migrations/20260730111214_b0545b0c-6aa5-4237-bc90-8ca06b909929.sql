-- 0. Phone validation: only validate new/changed values so legacy rows can be updated
CREATE OR REPLACE FUNCTION public.enforce_e164_phone_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  col text;
  val text;
  old_val text;
  new_json jsonb := to_jsonb(NEW);
  old_json jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    val := new_json ->> col;
    old_val := CASE WHEN old_json IS NULL THEN NULL ELSE old_json ->> col END;
    IF val IS NOT NULL AND val <> '' THEN
      IF TG_OP = 'UPDATE' AND old_val IS NOT DISTINCT FROM val THEN
        CONTINUE;  -- unchanged legacy value, leave as-is
      END IF;
      val := regexp_replace(val, '\s+', '', 'g');
      IF NOT public.is_valid_e164(val) THEN
        RAISE EXCEPTION 'Phone number in column % must be E.164 formatted (got %)', col, val
          USING ERRCODE = '22023';
      END IF;
      new_json := jsonb_set(new_json, ARRAY[col], to_jsonb(val));
    END IF;
  END LOOP;
  NEW := jsonb_populate_record(NEW, new_json);
  RETURN NEW;
END;
$function$;

-- 1. Recovery/recycle columns on applications
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recovery_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_from_application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recycle_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.applications
    ADD CONSTRAINT applications_recovery_status_check
    CHECK (recovery_status IN ('none','eligible','requested','recovered','recycled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_applications_recovery_status
  ON public.applications (recovery_status) WHERE recovery_status <> 'none';

UPDATE public.applications
   SET recovery_status = 'eligible',
       recovery_eligible_at = COALESCE(recovery_eligible_at, reviewed_at, updated_at, now())
 WHERE status = 'rejected' AND recovery_status = 'none';

CREATE OR REPLACE FUNCTION public.flag_rejected_application_recoverable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'rejected' AND COALESCE(OLD.status::text, '') <> 'rejected' THEN
    NEW.recovery_status := 'eligible';
    NEW.recovery_eligible_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flag_rejected_application_recoverable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_flag_rejected_application_recoverable ON public.applications;
CREATE TRIGGER trg_flag_rejected_application_recoverable
BEFORE UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.flag_rejected_application_recoverable();

-- 2. Recovery requests (applicant appeals)
CREATE TABLE IF NOT EXISTS public.application_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','recovered','recycled','declined')),
  resolution_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.application_recovery_requests TO authenticated;
GRANT ALL ON public.application_recovery_requests TO service_role;

ALTER TABLE public.application_recovery_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicants view own recovery requests" ON public.application_recovery_requests;
CREATE POLICY "Applicants view own recovery requests"
ON public.application_recovery_requests FOR SELECT TO authenticated
USING (
  requested_by = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.admin_assistant_permissions p
     WHERE p.user_id = auth.uid() AND COALESCE(p.can_approve_applications, false)
  )
);

DROP POLICY IF EXISTS "Applicants create own recovery requests" ON public.application_recovery_requests;
CREATE POLICY "Applicants create own recovery requests"
ON public.application_recovery_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.applications a
     WHERE a.id = application_id
       AND a.user_id = auth.uid()
       AND a.status = 'rejected'
  )
);

CREATE INDEX IF NOT EXISTS idx_recovery_requests_app ON public.application_recovery_requests (application_id);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_status ON public.application_recovery_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_recovery_requests_updated_at ON public.application_recovery_requests;
CREATE TRIGGER trg_recovery_requests_updated_at
BEFORE UPDATE ON public.application_recovery_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Applicant-initiated appeal
CREATE OR REPLACE FUNCTION public.request_application_recovery(_app_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Please describe why this application should be reconsidered (min 10 characters)'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.applications
     WHERE id = _app_id AND user_id = v_uid AND status = 'rejected'
  ) THEN
    RAISE EXCEPTION 'No rejected application found for this account' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.application_recovery_requests
     WHERE application_id = _app_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'A recovery request is already open for this application' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.application_recovery_requests (application_id, requested_by, reason)
  VALUES (_app_id, v_uid, btrim(_reason))
  RETURNING id INTO v_id;

  UPDATE public.applications
     SET recovery_status = 'requested', updated_at = now()
   WHERE id = _app_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_application_recovery(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_application_recovery(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_review_applications()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.admin_assistant_permissions p
     WHERE p.user_id = auth.uid() AND COALESCE(p.can_approve_applications, false)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_review_applications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review_applications() TO authenticated;

-- 4. Recover (reopen) a rejected application in place
CREATE OR REPLACE FUNCTION public.recover_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_review_applications() THEN
    RAISE EXCEPTION 'Not authorized to recover applications' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = _app_id AND status = 'rejected') THEN
    RAISE EXCEPTION 'Application is not in a rejected state' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.applications
     SET status = 'needs_info',
         rejection_reason = NULL,
         review_notes = COALESCE(_notes, review_notes),
         reviewed_by = v_uid,
         reviewed_at = now(),
         recovery_status = 'recovered',
         updated_at = now()
   WHERE id = _app_id;

  UPDATE public.application_recovery_requests
     SET status = 'recovered', reviewed_by = v_uid, reviewed_at = now(),
         resolution_notes = _notes, updated_at = now()
   WHERE application_id = _app_id AND status = 'open';

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_recovered', 'applications', _app_id::text,
          jsonb_build_object('notes', _notes, 'by_assistant', NOT public.is_admin()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recover_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_application(uuid, text) TO authenticated;

-- 5. Recycle: clone a rejected application into a fresh pending one
CREATE OR REPLACE FUNCTION public.recycle_application(_app_id uuid, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.applications%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_review_applications() THEN
    RAISE EXCEPTION 'Not authorized to recycle applications' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.applications WHERE id = _app_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_old.status <> 'rejected' THEN
    RAISE EXCEPTION 'Only rejected applications can be recycled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.applications (
    application_type, first_name, last_name, email, phone_country, phone_number,
    country, region, city, zip_code, user_id,
    agreed_terms, agreed_privacy, agreed_iot, agreed_fees,
    security_deposit_acknowledged, has_driver_license, has_insurance, has_registration,
    rideshare_platforms, desired_weekly_price,
    vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, vehicle_description,
    referee1_name, referee1_phone, referee1_address,
    referee2_name, referee2_phone, referee2_address,
    referee3_name, referee3_phone, referee3_address,
    status, review_notes, recovered_from_application_id, recycle_count
  ) VALUES (
    v_old.application_type, v_old.first_name, v_old.last_name, v_old.email,
    v_old.phone_country, v_old.phone_number,
    v_old.country, v_old.region, v_old.city, v_old.zip_code, v_old.user_id,
    v_old.agreed_terms, v_old.agreed_privacy, v_old.agreed_iot, v_old.agreed_fees,
    v_old.security_deposit_acknowledged, v_old.has_driver_license, v_old.has_insurance, v_old.has_registration,
    v_old.rideshare_platforms, v_old.desired_weekly_price,
    v_old.vehicle_make, v_old.vehicle_model, v_old.vehicle_year, v_old.vehicle_color,
    v_old.vehicle_plate, v_old.vehicle_description,
    v_old.referee1_name, v_old.referee1_phone, v_old.referee1_address,
    v_old.referee2_name, v_old.referee2_phone, v_old.referee2_address,
    v_old.referee3_name, v_old.referee3_phone, v_old.referee3_address,
    'pending', COALESCE(_notes, 'Recycled from application ' || _app_id::text),
    _app_id, COALESCE(v_old.recycle_count, 0) + 1
  )
  RETURNING id INTO v_new_id;

  UPDATE public.applications
     SET recovery_status = 'recycled', updated_at = now()
   WHERE id = _app_id;

  UPDATE public.application_recovery_requests
     SET status = 'recycled', reviewed_by = v_uid, reviewed_at = now(),
         resolution_notes = _notes, updated_at = now()
   WHERE application_id = _app_id AND status = 'open';

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_recycled', 'applications', _app_id::text,
          jsonb_build_object('new_application_id', v_new_id, 'notes', _notes,
                             'by_assistant', NOT public.is_admin()));

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recycle_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recycle_application(uuid, text) TO authenticated;

-- 6. Decline an appeal
CREATE OR REPLACE FUNCTION public.decline_application_recovery(_request_id uuid, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_review_applications() THEN
    RAISE EXCEPTION 'Not authorized to review recovery requests' USING ERRCODE = '42501';
  END IF;

  UPDATE public.application_recovery_requests
     SET status = 'declined', reviewed_by = v_uid, reviewed_at = now(),
         resolution_notes = _notes, updated_at = now()
   WHERE id = _request_id AND status = 'open'
   RETURNING application_id INTO v_app;

  IF v_app IS NULL THEN
    RAISE EXCEPTION 'Open recovery request not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.applications
     SET recovery_status = 'eligible', updated_at = now()
   WHERE id = v_app;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (v_uid, 'application_recovery_declined', 'application_recovery_requests', _request_id::text,
          jsonb_build_object('application_id', v_app, 'notes', _notes));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_application_recovery(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_application_recovery(uuid, text) TO authenticated;