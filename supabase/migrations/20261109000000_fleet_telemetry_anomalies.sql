-- Migration: Fleet Telemetry Anomaly Detection & Monitoring SLAs
-- Creates public.telemetry_anomalies table with indexes, RLS, and realtime streaming

CREATE TABLE IF NOT EXISTS public.telemetry_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.iot_devices(id) ON DELETE SET NULL,
  provider text,
  anomaly_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for rapid fleet filtering and audit dashboard queries
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_vehicle ON public.telemetry_anomalies(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_device ON public.telemetry_anomalies(device_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_type ON public.telemetry_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_severity ON public.telemetry_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_created ON public.telemetry_anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_ack ON public.telemetry_anomalies(acknowledged);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.telemetry_anomalies TO authenticated;
GRANT ALL ON public.telemetry_anomalies TO service_role;

-- Row Level Security
ALTER TABLE public.telemetry_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage telemetry anomalies" ON public.telemetry_anomalies;
CREATE POLICY "Admins manage telemetry anomalies"
  ON public.telemetry_anomalies FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Service role manages telemetry anomalies" ON public.telemetry_anomalies;
CREATE POLICY "Service role manages telemetry anomalies"
  ON public.telemetry_anomalies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Realtime streaming publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'telemetry_anomalies'
  ) THEN
    NULL;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_anomalies;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
