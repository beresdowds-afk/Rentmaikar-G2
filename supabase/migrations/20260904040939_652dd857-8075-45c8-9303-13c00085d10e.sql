GRANT SELECT, INSERT, UPDATE ON public.admin_daily_tasks TO authenticated;

CREATE POLICY "Assistants with support-task access can view daily tasks"
ON public.admin_daily_tasks FOR SELECT TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_view_support_tasks'));

CREATE POLICY "Assistants with support-task access can add daily tasks"
ON public.admin_daily_tasks FOR INSERT TO authenticated
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_view_support_tasks'));

CREATE POLICY "Assistants with support-task access can update daily tasks"
ON public.admin_daily_tasks FOR UPDATE TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_view_support_tasks'))
WITH CHECK (public.has_admin_privilege(auth.uid(), 'can_view_support_tasks'));