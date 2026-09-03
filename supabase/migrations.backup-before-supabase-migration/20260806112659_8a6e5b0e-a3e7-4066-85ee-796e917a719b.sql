CREATE OR REPLACE FUNCTION public.prevent_application_user_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Reassigning an application to a different user is not permitted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_application_user_reassignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_application_user_reassignment ON public.applications;
CREATE TRIGGER trg_prevent_application_user_reassignment
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_application_user_reassignment();

DROP POLICY IF EXISTS "Support staff can update applications" ON public.applications;
CREATE POLICY "Support staff can update applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  public.is_any_support_staff(auth.uid())
  AND status <> 'approved'::application_status
  AND status <> 'rejected'::application_status
)
WITH CHECK (
  public.is_any_support_staff(auth.uid())
  AND status <> 'approved'::application_status
  AND status <> 'rejected'::application_status
);