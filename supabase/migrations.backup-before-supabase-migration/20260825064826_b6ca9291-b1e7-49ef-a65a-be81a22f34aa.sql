ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

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
      AND (
        lower(btrim(s.assigned_region)) = lower(btrim(coalesce(_region, '')))
        OR lower(btrim(s.assigned_region)) IN (
          SELECT lower(btrim(c.code)) FROM public.platform_regions r
          JOIN public.platform_countries c ON c.id = r.country_id
          WHERE lower(btrim(r.name)) = lower(btrim(coalesce(_region, '')))
             OR lower(btrim(r.code)) = lower(btrim(coalesce(_region, '')))
          UNION
          SELECT lower(btrim(c.name)) FROM public.platform_regions r
          JOIN public.platform_countries c ON c.id = r.country_id
          WHERE lower(btrim(r.name)) = lower(btrim(coalesce(_region, '')))
             OR lower(btrim(r.code)) = lower(btrim(coalesce(_region, '')))
        )
      )
  );
$function$;

DROP POLICY IF EXISTS "IoT support can view credentials" ON public.vehicle_mqtt_credentials;
CREATE POLICY "IoT support can view assigned vehicle credentials"
ON public.vehicle_mqtt_credentials
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.support_tasks t
    JOIN public.support_staff s ON s.user_id = auth.uid() AND s.is_active = true
    WHERE t.assigned_to = auth.uid()
      AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
      AND t.task_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
      AND t.vehicle_id IS NOT NULL
      AND t.vehicle_id::text = vehicle_mqtt_credentials.vehicle_id
  )
);