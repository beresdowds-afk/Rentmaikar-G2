DO $$
BEGIN
  PERFORM cron.unschedule('mqtt-ingestion-worker-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'mqtt-ingestion-worker-1min',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://jrsydiofzceoeddjogov.supabase.co/functions/v1/mqtt-ingestion-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
      ),
      body := jsonb_build_object('scheduled_at', now())
    );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;