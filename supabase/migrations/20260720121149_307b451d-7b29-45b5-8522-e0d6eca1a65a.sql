
-- 1) Fix search_path for classify_onboarding_error
CREATE OR REPLACE FUNCTION public.classify_onboarding_error(_msg text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _msg IS NULL THEN NULL
    WHEN _msg ILIKE '%not authenticated%' OR _msg ILIKE '%JWT%' THEN 'auth_missing'
    WHEN _msg ILIKE '%permission denied%' OR _msg ILIKE '%only admins%' THEN 'permission_denied'
    WHEN _msg ILIKE '%invalid transition%' OR _msg ILIKE '%cannot advance%' THEN 'invalid_transition'
    WHEN _msg ILIKE '%does not exist%' THEN 'schema_missing'
    WHEN _msg ILIKE '%duplicate%' OR _msg ILIKE '%unique%' THEN 'duplicate'
    WHEN _msg ILIKE '%timeout%' THEN 'timeout'
    ELSE 'other'
  END;
$function$;

-- 2) Applications: stop leaking email existence via RPC
--    Rely on the existing partial unique index (idx_applications_email_pending)
--    to prevent duplicate pending applications without disclosing existence.
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Revoke the enumeration RPC from public/anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.no_pending_application_for_email(text) FROM PUBLIC, anon, authenticated;

-- 3) Revoke anon EXECUTE from SECURITY DEFINER functions that don't need it.
--    Trigger functions do not need EXECUTE grants; admin/auth-only RPCs must not be anon-callable.
REVOKE EXECUTE ON FUNCTION public.log_profile_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_user_public_uuid_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fanout_admin_onboarding_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() TO authenticated;

-- Proxy consent RPCs are intentionally anon-callable but gated by a per-consent secret token.
-- Keep them callable by anon, but ensure they are not granted to PUBLIC broadly.
REVOKE EXECUTE ON FUNCTION public.get_proxy_consent_context(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_proxy_consent(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_proxy_notification_prefs(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proxy_consent_context(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_proxy_consent(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_proxy_notification_prefs(uuid, jsonb, text) TO anon, authenticated;

-- 4) voice_call_permissions: restrict reads to admins/support staff.
DROP POLICY IF EXISTS "Authenticated users can view active permissions" ON public.voice_call_permissions;
CREATE POLICY "Admins and support can view call permissions"
ON public.voice_call_permissions
FOR SELECT
TO authenticated
USING (public.is_admin() OR public.is_any_support_staff(auth.uid()));

-- 5) voip_call_groups: restrict reads to admins/support staff and group members.
DROP POLICY IF EXISTS "Active groups visible to all authenticated users" ON public.voip_call_groups;
CREATE POLICY "Admins, support and members can view groups"
ON public.voip_call_groups
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    public.is_admin()
    OR public.is_any_support_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.voip_group_members m
      WHERE m.group_id = voip_call_groups.id AND m.user_id = auth.uid()
    )
  )
);
