
-- Vehicle MQTT Credentials table
-- Each vehicle gets unique MQTT credentials (username, hashed password, JWT tokens)
CREATE TABLE IF NOT EXISTS public.vehicle_mqtt_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id TEXT NOT NULL,                         -- links to iot_devices or vehicles
  iot_device_id UUID REFERENCES public.iot_devices(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL UNIQUE,                   -- e.g. rentmaikar_vehicle_XXXXX
  mqtt_username TEXT NOT NULL UNIQUE,               -- e.g. vehicle_12345
  password_hash TEXT NOT NULL,                      -- bcrypt hashed password
  password_hint TEXT,                               -- last 4 chars of raw password for reference
  broker_url TEXT NOT NULL DEFAULT 'mqtt.rentmaikar.com',
  broker_port INTEGER NOT NULL DEFAULT 8883,
  tls_enabled BOOLEAN NOT NULL DEFAULT true,
  topic_prefix TEXT NOT NULL,                       -- e.g. rentmaikar/vehicle/12345
  publish_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  subscribe_topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  jwt_token TEXT,                                   -- current active JWT
  jwt_issued_at TIMESTAMPTZ,
  jwt_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  installed_by UUID,                                -- iot_support staff user_id
  installed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_mqtt_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage credentials
CREATE POLICY "Admins can manage MQTT credentials"
  ON public.vehicle_mqtt_credentials
  FOR ALL
  USING (public.is_admin());

-- IoT support staff can view and insert credentials (but not delete)
CREATE POLICY "IoT support can view credentials"
  ON public.vehicle_mqtt_credentials
  FOR SELECT
  USING (
    public.is_admin() OR
    public.is_any_support_staff(auth.uid())
  );

CREATE POLICY "IoT support can insert credentials"
  ON public.vehicle_mqtt_credentials
  FOR INSERT
  WITH CHECK (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.support_staff
      WHERE user_id = auth.uid()
        AND support_type IN ('iot_installation', 'iot_maintenance')
        AND is_active = true
    )
  );

CREATE TRIGGER update_vehicle_mqtt_credentials_updated_at
  BEFORE UPDATE ON public.vehicle_mqtt_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Driver Behavior Logs (accelerometer events)
CREATE TABLE IF NOT EXISTS public.driver_behavior_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  driver_id UUID,                                   -- auth user id of driver
  rental_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'harsh_braking', 'harsh_acceleration', 'harsh_cornering',
    'speeding', 'impact', 'rollover', 'airbag_deploy'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  accel_x FLOAT,
  accel_y FLOAT,
  accel_z FLOAT,
  total_g FLOAT,
  threshold_g FLOAT,
  speed_at_event FLOAT,
  latitude FLOAT,
  longitude FLOAT,
  heading FLOAT,
  mqtt_topic TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_behavior_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all behavior logs"
  ON public.driver_behavior_logs
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Drivers can view their own behavior logs"
  ON public.driver_behavior_logs
  FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "System can insert behavior logs"
  ON public.driver_behavior_logs
  FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_any_support_staff(auth.uid()));

-- MQTT Telemetry Logs (raw location/engine/status payloads)
CREATE TABLE IF NOT EXISTS public.mqtt_telemetry_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('location', 'engine', 'status', 'sensors', 'command')),
  payload JSONB NOT NULL,
  mqtt_topic TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mqtt_telemetry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view telemetry logs"
  ON public.mqtt_telemetry_logs
  FOR ALL
  USING (public.is_admin());

CREATE POLICY "IoT support can view telemetry"
  ON public.mqtt_telemetry_logs
  FOR SELECT
  USING (public.is_any_support_staff(auth.uid()));

-- Index for performance
CREATE INDEX idx_driver_behavior_vehicle ON public.driver_behavior_logs(vehicle_id, created_at DESC);
CREATE INDEX idx_driver_behavior_driver ON public.driver_behavior_logs(driver_id, created_at DESC);
CREATE INDEX idx_mqtt_telemetry_vehicle ON public.mqtt_telemetry_logs(vehicle_id, received_at DESC);
CREATE INDEX idx_mqtt_creds_vehicle ON public.vehicle_mqtt_credentials(vehicle_id);
CREATE INDEX idx_mqtt_creds_device ON public.vehicle_mqtt_credentials(iot_device_id);
