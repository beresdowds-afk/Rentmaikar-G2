-- Guard privileged columns on public.applications against unrestricted
-- support-staff updates. RLS WITH CHECK cannot compare against OLD, so the
-- column-scope guard is enforced with a BEFORE UPDATE trigger.

CREATE OR REPLACE FUNCTION public.guard_application_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged boolean := false;
  v_authorized boolean := false;
BEGIN
  -- service_role / internal jobs (no auth context) bypass the guard.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_privileged :=
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason;

  IF NOT v_privileged THEN
    RETURN NEW;
  END IF;

  v_authorized := public.is_admin();

  IF NOT v_authorized THEN
    SELECT COALESCE(can_approve_applications, false)
      INTO v_authorized
      FROM public.admin_assistants
     WHERE user_id = auth.uid()
       AND is_active = true
     LIMIT 1;
  END IF;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'Not authorized to change application approval fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_application_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_application_privileged_columns ON public.applications;
CREATE TRIGGER guard_application_privileged_columns
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_application_privileged_columns();