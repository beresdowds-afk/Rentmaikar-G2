
-- 1. Fix communication_providers: restrict internal routing fields to admins/support staff
DROP POLICY IF EXISTS "Authenticated users can view active providers" ON public.communication_providers;

CREATE POLICY "Admins and support staff can view providers"
ON public.communication_providers
FOR SELECT
TO authenticated
USING (is_admin() OR is_any_support_staff(auth.uid()));

-- 2. Fix incident-photos DELETE policy: align with INSERT/SELECT (folder = vehicle_incidents.id)
DROP POLICY IF EXISTS "Drivers can delete their own photos" ON storage.objects;

CREATE POLICY "Drivers can delete their own incident photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'incident-photos'
  AND (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM public.vehicle_incidents vi
      WHERE (storage.foldername(objects.name))[1] = vi.id::text
        AND (vi.driver_id = auth.uid() OR vi.owner_id = auth.uid())
    )
  )
);

-- 3. Revoke EXECUTE on SECURITY DEFINER functions that should not be callable
--    by anon/authenticated. Trigger functions and admin-only helpers don't need
--    to be exposed through the Data API. RLS-referenced helpers (has_role,
--    is_admin, is_any_support_staff, is_support_staff, get_support_staff_city,
--    assistant_can_access_user, has_admin_assistant_permission,
--    no_pending_application_for_email) remain executable because RLS policies
--    call them as the invoking role.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_late_incident_report() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.forbid_daily_plan_on_default() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_document_rejection() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_2fa_settings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_call_in_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_call_in_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_call_in_closed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_persona_template_for_region() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_assistant_user_assignments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_admin_assistant_permissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_paypal_transaction_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
