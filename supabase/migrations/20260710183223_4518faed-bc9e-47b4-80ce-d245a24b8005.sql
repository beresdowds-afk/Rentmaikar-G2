
-- 1) telemetry_providers: tighten read access to admins + IoT support staff
DROP POLICY IF EXISTS "Authenticated read telemetry providers" ON public.telemetry_providers;

CREATE POLICY "Admins and IoT staff read telemetry providers"
ON public.telemetry_providers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_support_staff(auth.uid(), 'iot_installation'::public.support_task_type)
  OR public.is_support_staff(auth.uid(), 'iot_maintenance'::public.support_task_type)
);

-- 2) vehicle-photos storage bucket: only allow uploads into the user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload vehicle photos" ON storage.objects;

CREATE POLICY "Users can upload their own vehicle photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3) Lock down SECURITY DEFINER helpers.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.update_updated_at_column()',
    'public.check_late_incident_report()',
    'public.forbid_daily_plan_on_default()',
    'public.auto_create_2fa_settings()',
    'public.set_call_in_expiry()',
    'public.on_call_in_created()',
    'public.on_call_in_closed()',
    'public.audit_assistant_user_assignments()',
    'public.audit_admin_assistant_permissions()',
    'public.no_pending_application_for_email(text)',
    'public.log_admin_action(text, text, text, jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.is_admin()',
    'public.is_any_support_staff(uuid)',
    'public.is_support_staff(uuid, public.support_task_type)',
    'public.has_admin_assistant_permission(uuid, text)',
    'public.assistant_can_access_user(uuid)',
    'public.get_support_staff_city(uuid, public.support_task_type)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
