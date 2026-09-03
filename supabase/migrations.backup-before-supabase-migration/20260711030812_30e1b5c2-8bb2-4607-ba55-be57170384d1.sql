
-- 1) Restrict vehicle_mqtt_credentials SELECT to admins and IoT-specific support staff
DROP POLICY IF EXISTS "IoT support can view credentials" ON public.vehicle_mqtt_credentials;

CREATE POLICY "IoT support can view credentials"
ON public.vehicle_mqtt_credentials
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
  )
);

-- 2) Restrict mqtt_telemetry_logs SELECT to admins and IoT-specific support staff
DROP POLICY IF EXISTS "IoT support can view telemetry" ON public.mqtt_telemetry_logs;

CREATE POLICY "IoT support can view telemetry"
ON public.mqtt_telemetry_logs
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
  )
);

-- 3) Harden SECURITY DEFINER helpers callable by authenticated users:
--    prevent information leakage by refusing to answer questions about
--    other users unless the caller is an admin. RLS policies always call
--    these with auth.uid(), so this is transparent to RLS while closing
--    the RPC-based enumeration surface.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'admin'::app_role
     )
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_any_support_staff(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'admin'::app_role
     )
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.support_staff
    WHERE user_id = _user_id AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid, _type support_task_type)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'admin'::app_role
     )
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.support_staff
    WHERE user_id = _user_id
      AND support_type = _type
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_support_staff_city(_user_id uuid, _type support_task_type)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _city text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'admin'::app_role
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT assigned_city INTO _city
  FROM public.support_staff
  WHERE user_id = _user_id
    AND support_type = _type
    AND is_active = true
  LIMIT 1;

  RETURN _city;
END;
$$;

-- is_admin() takes no arguments and only answers about the caller (auth.uid()),
-- so no additional guard is needed. Reinforce hardening for consistency.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
$$;
