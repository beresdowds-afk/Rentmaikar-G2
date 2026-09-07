DROP POLICY IF EXISTS "IoT support can view assigned vehicle credentials" ON public.vehicle_mqtt_credentials;

CREATE POLICY "Admins can view MQTT credentials"
ON public.vehicle_mqtt_credentials
FOR SELECT
TO authenticated
USING (is_admin());

CREATE OR REPLACE FUNCTION public.get_assigned_mqtt_credentials()
RETURNS TABLE (
  id uuid,
  vehicle_id text,
  iot_device_id uuid,
  client_id text,
  mqtt_username text,
  broker_url text,
  broker_port integer,
  tls_enabled boolean,
  topic_prefix text,
  publish_topics text[],
  subscribe_topics text[],
  jwt_expires_at timestamptz,
  is_active boolean,
  last_connected_at timestamptz,
  installed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.vehicle_id, c.iot_device_id, c.client_id, c.mqtt_username,
         c.broker_url, c.broker_port, c.tls_enabled, c.topic_prefix,
         c.publish_topics, c.subscribe_topics, c.jwt_expires_at, c.is_active,
         c.last_connected_at, c.installed_at, c.created_at, c.updated_at
  FROM public.vehicle_mqtt_credentials c
  WHERE is_admin()
     OR EXISTS (
       SELECT 1
       FROM support_tasks t
       JOIN support_staff s ON s.user_id = auth.uid() AND s.is_active = true
       WHERE t.assigned_to = auth.uid()
         AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
         AND t.task_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
         AND t.vehicle_id IS NOT NULL
         AND t.vehicle_id::text = c.vehicle_id
     );
$$;

REVOKE ALL ON FUNCTION public.get_assigned_mqtt_credentials() FROM public;
GRANT EXECUTE ON FUNCTION public.get_assigned_mqtt_credentials() TO authenticated;