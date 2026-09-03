ALTER TABLE public.telemetry_providers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_providers;