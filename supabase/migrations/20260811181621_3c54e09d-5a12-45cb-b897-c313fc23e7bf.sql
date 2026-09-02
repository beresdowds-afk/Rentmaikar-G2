CREATE OR REPLACE FUNCTION public.support_staff_region_match(_region text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_staff ss
    WHERE ss.user_id = auth.uid()
      AND ss.is_active = true
      AND (
        ss.assigned_region IS NULL AND false
        OR lower(btrim(ss.assigned_region)) = lower(btrim(COALESCE(_region, '')))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.support_staff_region_match(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_staff_region_match(text) TO authenticated, service_role;

DROP POLICY IF EXISTS outreach_contacts_staff_read ON public.outreach_contacts;
CREATE POLICY outreach_contacts_staff_read
ON public.outreach_contacts
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.support_staff_region_match(region)
);

DROP POLICY IF EXISTS outreach_contacts_staff_update ON public.outreach_contacts;
CREATE POLICY outreach_contacts_staff_update
ON public.outreach_contacts
FOR UPDATE
TO authenticated
USING (
  is_admin()
  OR has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.support_staff_region_match(region)
)
WITH CHECK (
  is_admin()
  OR has_role(auth.uid(), 'admin_assistant'::app_role)
  OR public.support_staff_region_match(region)
);