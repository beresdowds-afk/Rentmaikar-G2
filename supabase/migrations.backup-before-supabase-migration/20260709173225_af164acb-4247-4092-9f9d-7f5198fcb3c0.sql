
ALTER TABLE public.region_definitions REPLICA IDENTITY FULL;
ALTER TABLE public.region_localized_content REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.region_definitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.region_localized_content;
