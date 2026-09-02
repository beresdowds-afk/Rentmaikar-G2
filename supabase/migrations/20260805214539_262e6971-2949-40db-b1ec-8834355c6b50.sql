GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT INSERT ON public.applications TO anon;
GRANT ALL ON public.applications TO service_role;

-- Restrict support-staff direct updates: they may not flip status to
-- approved/rejected or reassign ownership; approvals go through approve_application().
DROP POLICY IF EXISTS "Support staff can update applications" ON public.applications;
CREATE POLICY "Support staff can update applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (public.is_any_support_staff(auth.uid()))
WITH CHECK (
  public.is_any_support_staff(auth.uid())
  AND status <> 'approved'::application_status
  AND status <> 'rejected'::application_status
  AND user_id IS NOT DISTINCT FROM user_id
);