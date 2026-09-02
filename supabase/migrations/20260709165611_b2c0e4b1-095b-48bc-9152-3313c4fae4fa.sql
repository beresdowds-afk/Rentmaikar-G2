
-- 1. Applications duplicate-email check: reference the NEW row's email.
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
  ON public.applications
  FOR INSERT
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.email = applications.email
        AND a.status = ANY (ARRAY['pending'::application_status, 'under_review'::application_status])
    )
  );

-- 2. platform_email_config: admins only for SELECT
DROP POLICY IF EXISTS "Authenticated users can read email config" ON public.platform_email_config;
CREATE POLICY "Admins can read email config"
  ON public.platform_email_config
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 3. voip_group_members: users see only their own memberships; admins see all
DROP POLICY IF EXISTS "Users can view group memberships" ON public.voip_group_members;
CREATE POLICY "Users can view their own group memberships"
  ON public.voip_group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 4. api_validation_endpoints: signed-in users only
DROP POLICY IF EXISTS "Anyone can view active API endpoints" ON public.api_validation_endpoints;
CREATE POLICY "Authenticated users can view active API endpoints"
  ON public.api_validation_endpoints
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 5. communication_providers: signed-in users only
DROP POLICY IF EXISTS "Anyone can view active providers" ON public.communication_providers;
CREATE POLICY "Authenticated users can view active providers"
  ON public.communication_providers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 6. roadside_partners: signed-in users only
DROP POLICY IF EXISTS "Anyone can view active roadside partners" ON public.roadside_partners;
CREATE POLICY "Authenticated users can view active roadside partners"
  ON public.roadside_partners
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 7. vehicles: drivers with an active rental can read their assigned vehicle
DROP POLICY IF EXISTS "Drivers can view their rented vehicle" ON public.vehicles;
CREATE POLICY "Drivers can view their rented vehicle"
  ON public.vehicles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rentals r
      WHERE r.vehicle_id = vehicles.id
        AND r.driver_id = auth.uid()
        AND r.status = 'active'
    )
  );

-- 8. Storage: stop listing on public buckets. Public URL access still works.
DROP POLICY IF EXISTS "Anyone can view profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view vehicle photos" ON storage.objects;

-- 9. Revoke public/anon EXECUTE on SECURITY DEFINER helpers.
--    Keep authenticated where RLS/functions require it; revoke everywhere else.
REVOKE EXECUTE ON FUNCTION public.auto_create_2fa_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_late_incident_report() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.forbid_daily_plan_on_default() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_any_support_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_support_staff(uuid, support_task_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_admin_assistant_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_support_staff_city(uuid, support_task_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon;
