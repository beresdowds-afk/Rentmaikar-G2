CREATE OR REPLACE FUNCTION public.enforce_vehicle_telemetry_source_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_provider text;
BEGIN
  IF NEW.last_source IN ('emqx', 'mqtt', 'traccar', 'sarekon') OR NEW.provider IS NOT NULL THEN
    source_provider := COALESCE(
      NEW.provider,
      CASE WHEN NEW.last_source = 'mqtt' THEN 'emqx' ELSE NEW.last_source END
    );

    IF source_provider NOT IN ('emqx', 'traccar', 'sarekon')
      OR NEW.provider_device_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.iot_devices d
        JOIN public.vehicles v ON v.id = d.vehicle_id
        WHERE d.provider = source_provider
          AND d.vehicle_id::text = NEW.vehicle_id
          AND (d.provider_device_id = NEW.provider_device_id OR d.serial_number = NEW.provider_device_id)
          AND d.status = 'active'
          AND d.telemetry_enabled = true
          AND v.gps_tracking_enabled = true
      ) THEN
      RAISE EXCEPTION 'telemetry source is not bound to an active vehicle device';
    END IF;

    IF NEW.gps_timestamp IS NULL
      OR NEW.gps_timestamp > now() + interval '5 minutes'
      OR NEW.gps_timestamp < now() - CASE
        WHEN source_provider = 'sarekon' THEN interval '48 hours'
        ELSE interval '24 hours'
      END THEN
      RAISE EXCEPTION 'telemetry event timestamp is outside the accepted window';
    END IF;

    IF (NEW.latitude IS NULL) <> (NEW.longitude IS NULL)
      OR NEW.latitude < -90 OR NEW.latitude > 90
      OR NEW.longitude < -180 OR NEW.longitude > 180
      OR (NEW.latitude = 0 AND NEW.longitude = 0)
      OR NEW.speed < 0 OR NEW.speed > 300
      OR NEW.heading < 0 OR NEW.heading >= 360 THEN
      RAISE EXCEPTION 'telemetry values are invalid';
    END IF;

    IF TG_OP = 'UPDATE'
      AND OLD.gps_timestamp IS NOT NULL
      AND NEW.gps_timestamp <= OLD.gps_timestamp THEN
      RETURN OLD;
    END IF;

    NEW.received_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vehicle_telemetry_source_binding()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vehicle_telemetry_source_binding
  ON public.vehicle_telemetry_state;
CREATE TRIGGER trg_vehicle_telemetry_source_binding
  BEFORE INSERT OR UPDATE ON public.vehicle_telemetry_state
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_vehicle_telemetry_source_binding();

ALTER TABLE public.mqtt_telemetry_logs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_device_id text,
  ADD COLUMN IF NOT EXISTS provider_event_time timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS mqtt_telemetry_provider_event_uidx
  ON public.mqtt_telemetry_logs (provider, provider_device_id, provider_event_time, mqtt_topic);
