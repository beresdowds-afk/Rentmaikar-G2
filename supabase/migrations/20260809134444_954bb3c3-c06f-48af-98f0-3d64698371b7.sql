CREATE TABLE IF NOT EXISTS public.vehicle_telemetry_state (
  vehicle_id text PRIMARY KEY,
  latitude numeric,
  longitude numeric,
  speed numeric,
  ignition boolean,
  battery numeric,
  fuel numeric,
  temperature numeric,
  last_source text,
  last_event_type text,
  last_event_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_telemetry_state TO authenticated;
GRANT ALL ON public.vehicle_telemetry_state TO service_role;
ALTER TABLE public.vehicle_telemetry_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and IoT support can view telemetry state"
ON public.vehicle_telemetry_state FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
  )
);

CREATE TABLE IF NOT EXISTS public.telemetry_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  provider text,
  devices_seen integer NOT NULL DEFAULT 0,
  events_processed integer NOT NULL DEFAULT 0,
  analytics_emitted integer NOT NULL DEFAULT 0,
  broker_reachable boolean NOT NULL DEFAULT false,
  degraded_reason text,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telemetry_ingest_runs TO authenticated;
GRANT ALL ON public.telemetry_ingest_runs TO service_role;
ALTER TABLE public.telemetry_ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and IoT support can view ingest runs"
ON public.telemetry_ingest_runs FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.support_type = ANY (ARRAY['iot_installation'::support_task_type, 'iot_maintenance'::support_task_type])
  )
);

CREATE INDEX IF NOT EXISTS idx_telemetry_ingest_runs_created_at ON public.telemetry_ingest_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_state_updated_at ON public.vehicle_telemetry_state (updated_at DESC);

CREATE TRIGGER update_vehicle_telemetry_state_updated_at
BEFORE UPDATE ON public.vehicle_telemetry_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_telemetry_state;

SELECT cron.unschedule('mqtt-ingestion-worker-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mqtt-ingestion-worker-1min');

SELECT cron.schedule(
  'mqtt-ingestion-worker-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/mqtt-ingestion-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);