-- 1) Owner read access to live telemetry (drivers stay excluded)
CREATE OR REPLACE FUNCTION public.owns_vehicle_text(_vehicle_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.owner_id = auth.uid()
      AND _vehicle_id IS NOT NULL
      AND v.id::text = _vehicle_id
  );
$$;

REVOKE ALL ON FUNCTION public.owns_vehicle_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_vehicle_text(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners view telemetry state for their vehicles" ON public.vehicle_telemetry_state;
CREATE POLICY "Owners view telemetry state for their vehicles"
ON public.vehicle_telemetry_state
FOR SELECT TO authenticated
USING (public.owns_vehicle_text(vehicle_id));

DROP POLICY IF EXISTS "Owners view telemetry logs for their vehicles" ON public.mqtt_telemetry_logs;
CREATE POLICY "Owners view telemetry logs for their vehicles"
ON public.mqtt_telemetry_logs
FOR SELECT TO authenticated
USING (public.owns_vehicle_text(vehicle_id));

DROP POLICY IF EXISTS "Owners view behavior logs for their vehicles" ON public.driver_behavior_logs;
CREATE POLICY "Owners view behavior logs for their vehicles"
ON public.driver_behavior_logs
FOR SELECT TO authenticated
USING (public.owns_vehicle_text(vehicle_id));

-- Drivers must not read live location/telemetry streams.
DROP POLICY IF EXISTS "Drivers can view their own behavior logs" ON public.driver_behavior_logs;

-- 2) Provider health alerts
CREATE TABLE IF NOT EXISTS public.provider_health_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  channel TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  window_hours INTEGER NOT NULL DEFAULT 1,
  error_rate NUMERIC,
  sample_size INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  notified_channels TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  dedupe_key TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_health_alerts_created
  ON public.provider_health_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_health_alerts_dedupe
  ON public.provider_health_alerts (dedupe_key, created_at DESC);

GRANT SELECT, UPDATE ON public.provider_health_alerts TO authenticated;
GRANT ALL ON public.provider_health_alerts TO service_role;

ALTER TABLE public.provider_health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view provider health alerts"
ON public.provider_health_alerts
FOR SELECT TO authenticated
USING (is_admin() OR has_admin_privilege(auth.uid(), 'can_view_iot'));

CREATE POLICY "Staff acknowledge provider health alerts"
ON public.provider_health_alerts
FOR UPDATE TO authenticated
USING (is_admin() OR has_admin_privilege(auth.uid(), 'can_view_iot'))
WITH CHECK (is_admin() OR has_admin_privilege(auth.uid(), 'can_view_iot'));

CREATE TRIGGER trg_provider_health_alerts_updated_at
BEFORE UPDATE ON public.provider_health_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();