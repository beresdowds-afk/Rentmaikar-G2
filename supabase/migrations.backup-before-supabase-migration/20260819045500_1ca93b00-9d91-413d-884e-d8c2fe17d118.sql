SELECT cron.schedule(
  'sarekon-location-worker-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/sarekon-location-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now(), 'interval_seconds', 15)
  );
  $$
);