ALTER TABLE public.mqtt_telemetry_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mqtt_telemetry_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mqtt_telemetry_logs;
  END IF;
END
$$;