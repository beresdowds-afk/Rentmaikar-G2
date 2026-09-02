ALTER TABLE public.iot_sync_activity_log REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_sync_activity_log;