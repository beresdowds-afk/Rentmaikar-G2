CREATE POLICY "Staff view active tour step configs"
ON public.tour_step_configs
FOR SELECT
TO authenticated
USING (is_active = true AND (public.has_admin_privilege(auth.uid(), 'can_manage_content') OR public.is_any_support_staff(auth.uid())));

GRANT SELECT ON public.tour_step_configs TO authenticated;
GRANT SELECT ON public.legal_agreement_templates TO authenticated;
GRANT SELECT ON public.training_modules TO authenticated;