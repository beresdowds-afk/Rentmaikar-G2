CREATE OR REPLACE FUNCTION public.support_staff_can_view_task(_city text, _region text, _type support_task_type)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.support_type = _type
      AND lower(btrim(s.assigned_city)) = lower(btrim(coalesce(_city, '')))
      AND lower(btrim(s.assigned_region)) = lower(btrim(coalesce(_region, '')))
  );
$function$;

REVOKE ALL ON FUNCTION public.support_staff_can_view_task(text, text, support_task_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_staff_can_view_task(text, text, support_task_type) FROM anon;
GRANT EXECUTE ON FUNCTION public.support_staff_can_view_task(text, text, support_task_type) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support staff can view tasks in their city" ON public.support_tasks;
CREATE POLICY "Support staff can view tasks in their assigned city and region"
ON public.support_tasks
FOR SELECT
TO authenticated
USING (public.support_staff_can_view_task(city, region, task_type));

CREATE OR REPLACE FUNCTION public.support_staff_can_view_application(_city text, _region text, _country text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND lower(btrim(s.assigned_city)) = lower(btrim(coalesce(_city, '')))
      AND lower(btrim(s.assigned_region)) IN (
        lower(btrim(coalesce(_region, ''))),
        lower(btrim(coalesce(_country, '')))
      )
  );
$function$;