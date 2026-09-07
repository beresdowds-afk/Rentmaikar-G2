DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'cron' AND pg_proc.proname = 'unschedule') THEN
    PERFORM cron.unschedule('hologram-sync-hourly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hologram-sync-hourly');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'cron' AND pg_proc.proname = 'schedule') THEN
    PERFORM cron.schedule(
      'hologram-sync-hourly',
      '0 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://jrsydiofzceoeddjogov.supabase.co/functions/v1/hologram-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
        ),
        body := jsonb_build_object('scheduled_at', now())
      ) AS request_id;
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;