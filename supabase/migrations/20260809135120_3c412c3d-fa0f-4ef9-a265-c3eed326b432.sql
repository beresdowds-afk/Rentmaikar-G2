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
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);