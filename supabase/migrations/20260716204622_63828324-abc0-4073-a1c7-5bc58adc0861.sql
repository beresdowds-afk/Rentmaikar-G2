
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
  ON public.applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.no_pending_application_for_email(email));
