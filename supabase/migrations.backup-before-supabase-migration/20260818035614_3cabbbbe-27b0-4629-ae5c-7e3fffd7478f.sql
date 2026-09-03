-- Unified GPS location architecture: additive columns + indexes

ALTER TABLE public.iot_devices
  ADD COLUMN IF NOT EXISTS provider_device_id text;

CREATE UNIQUE INDEX IF NOT EXISTS iot_devices_provider_device_uidx
  ON public.iot_devices (provider, provider_device_id)
  WHERE provider_device_id IS NOT NULL;

UPDATE public.iot_devices
SET provider_device_id = COALESCE(
      health_details->>'sarekon_dvd_id',
      health_details->>'traccar_device_id',
      health_details->>'device_id'
    )
WHERE provider_device_id IS NULL
  AND health_details IS NOT NULL
  AND COALESCE(
      health_details->>'sarekon_dvd_id',
      health_details->>'traccar_device_id',
      health_details->>'device_id'
    ) IS NOT NULL;

ALTER TABLE public.vehicle_telemetry_state
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_device_id text,
  ADD COLUMN IF NOT EXISTS altitude numeric,
  ADD COLUMN IF NOT EXISTS heading numeric,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS gps_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_historic boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS vehicle_telemetry_state_provider_idx
  ON public.vehicle_telemetry_state (provider);
CREATE INDEX IF NOT EXISTS vehicle_telemetry_state_provider_device_idx
  ON public.vehicle_telemetry_state (provider_device_id);
CREATE INDEX IF NOT EXISTS vehicle_telemetry_state_gps_ts_idx
  ON public.vehicle_telemetry_state (gps_timestamp DESC);
CREATE INDEX IF NOT EXISTS mqtt_telemetry_logs_vehicle_received_idx
  ON public.mqtt_telemetry_logs (vehicle_id, received_at DESC);

INSERT INTO public.iot_sync_schedule (provider, enabled, interval_minutes)
VALUES ('sarekon_location', true, 1)
ON CONFLICT (provider) DO NOTHING;