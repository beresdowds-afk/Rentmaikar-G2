ALTER TABLE public.training_completions REPLICA IDENTITY FULL;
ALTER TABLE public.training_refresh_requirements REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'training_completions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_completions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'training_refresh_requirements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_refresh_requirements;
  END IF;
END $$;