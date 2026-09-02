-- inbox_canned_replies: split blanket assistant ALL access into permission-scoped policies
DROP POLICY IF EXISTS "Admins manage canned replies" ON public.inbox_canned_replies;

CREATE POLICY "canned_replies_read" ON public.inbox_canned_replies
FOR SELECT TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_view_communications'));

CREATE POLICY "canned_replies_insert" ON public.inbox_canned_replies
FOR INSERT TO authenticated
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

CREATE POLICY "canned_replies_update" ON public.inbox_canned_replies
FOR UPDATE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_send_communications'))
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

CREATE POLICY "canned_replies_delete" ON public.inbox_canned_replies
FOR DELETE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

-- inbox_auto_reply_rules: same permission-scoped model
DROP POLICY IF EXISTS "Admins manage auto reply rules" ON public.inbox_auto_reply_rules;

CREATE POLICY "auto_reply_rules_read" ON public.inbox_auto_reply_rules
FOR SELECT TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_view_communications'));

CREATE POLICY "auto_reply_rules_insert" ON public.inbox_auto_reply_rules
FOR INSERT TO authenticated
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

CREATE POLICY "auto_reply_rules_update" ON public.inbox_auto_reply_rules
FOR UPDATE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_send_communications'))
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

CREATE POLICY "auto_reply_rules_delete" ON public.inbox_auto_reply_rules
FOR DELETE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_send_communications'));

-- outreach_contacts: replace raw has_role(admin_assistant) with permission-scoped checks
DROP POLICY IF EXISTS "outreach_contacts_staff_read" ON public.outreach_contacts;
DROP POLICY IF EXISTS "outreach_contacts_staff_insert" ON public.outreach_contacts;
DROP POLICY IF EXISTS "outreach_contacts_staff_update" ON public.outreach_contacts;

CREATE POLICY "outreach_contacts_staff_read" ON public.outreach_contacts
FOR SELECT TO authenticated
USING (
  public.has_admin_privilege(auth.uid(), 'can_view_users')
  OR public.support_staff_region_match(region)
);

CREATE POLICY "outreach_contacts_staff_insert" ON public.outreach_contacts
FOR INSERT TO authenticated
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_manage_users'));

CREATE POLICY "outreach_contacts_staff_update" ON public.outreach_contacts
FOR UPDATE TO authenticated
USING (
  public.has_admin_privilege(auth.uid(), 'can_manage_users')
  OR public.support_staff_region_match(region)
)
WITH CHECK (
  public.has_admin_privilege(auth.uid(), 'can_manage_users')
  OR public.support_staff_region_match(region)
);