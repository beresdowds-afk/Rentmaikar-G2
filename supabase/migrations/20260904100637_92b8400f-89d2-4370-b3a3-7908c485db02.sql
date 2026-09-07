CREATE OR REPLACE FUNCTION public.has_admin_privilege(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
     OR (
       EXISTS (
         SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = _user_id
           AND ur.role IN (
             'admin_assistant'::app_role,
             'iot_support'::app_role,
             'vehicle_support'::app_role,
             'legal_support'::app_role,
             'insurance_support'::app_role
           )
       )
       AND public.has_admin_assistant_permission(_user_id, _permission)
     );
$$;

DROP POLICY IF EXISTS "Staff can view provisioning state" ON public.iot_provisioning_state;
CREATE POLICY "Granted staff can view provisioning state"
ON public.iot_provisioning_state
FOR SELECT
TO authenticated
USING (public.has_admin_privilege(auth.uid(), 'can_view_iot'));