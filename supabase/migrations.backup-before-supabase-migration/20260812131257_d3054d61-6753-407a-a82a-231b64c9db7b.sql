-- 1. Outreach contacts: remove blanket region-based staff access
DROP POLICY IF EXISTS outreach_contacts_staff_read ON public.outreach_contacts;
CREATE POLICY outreach_contacts_staff_read ON public.outreach_contacts
FOR SELECT TO authenticated
USING (
  public.has_admin_privilege(auth.uid(), 'can_view_users')
  OR public.has_admin_privilege(auth.uid(), 'can_view_communications')
);

DROP POLICY IF EXISTS outreach_contacts_staff_update ON public.outreach_contacts;
CREATE POLICY outreach_contacts_staff_update ON public.outreach_contacts
FOR UPDATE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_manage_users'))
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_manage_users'));

-- 2. profile_settings_audit: no client-side inserts; trigger writes as definer
DROP POLICY IF EXISTS "Users can insert their own audit entries" ON public.profile_settings_audit;
REVOKE INSERT, UPDATE, DELETE ON public.profile_settings_audit FROM authenticated, anon;
GRANT SELECT ON public.profile_settings_audit TO authenticated;
GRANT ALL ON public.profile_settings_audit TO service_role;