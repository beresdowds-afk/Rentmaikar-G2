
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
  ON public.applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.email = applications.email
        AND a.status IN ('pending'::application_status, 'under_review'::application_status)
    )
  );
