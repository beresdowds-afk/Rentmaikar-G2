SELECT cron.unschedule('persona-reconcile-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'persona-reconcile-15min');

SELECT cron.schedule(
  'persona-reconcile-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/persona-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-correlation-id', 'cron-persona-reconcile-' || to_char(now(), 'YYYYMMDDHH24MI'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := jsonb_build_object('limit', 200, 'scheduled_at', now())
  );
  $$
);