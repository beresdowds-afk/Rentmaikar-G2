
DROP POLICY IF EXISTS "Users can view own applications" ON public.applications;
CREATE POLICY "Users can view own applications"
  ON public.applications
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can view active roadside partners" ON public.roadside_partners;
CREATE POLICY "Contextual users can view active roadside partners"
  ON public.roadside_partners
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      is_admin()
      OR is_any_support_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.rentals r
        WHERE (r.driver_id = auth.uid() OR r.owner_id = auth.uid())
          AND r.status::text IN ('active','pending','overdue')
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicle_incidents vi
        WHERE vi.driver_id = auth.uid()
          AND vi.status IN ('reported','acknowledged','in_progress')
      )
    )
  );

REVOKE EXECUTE ON FUNCTION public.log_profile_settings_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_tour_step_config_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.needs_latest_agreement_acceptance(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.needs_latest_agreement_acceptance(text, text) TO authenticated;
