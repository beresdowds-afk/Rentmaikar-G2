DO $$
BEGIN
  PERFORM cron.unschedule('persona-reconcile-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'persona-reconcile-15min',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://jrsydiofzceoeddjogov.supabase.co/functions/v1/persona-reconcile',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-correlation-id', 'cron-persona-reconcile-' || to_char(now(), 'YYYYMMDDHH24MI'),
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1)
      ),
      body := jsonb_build_object('limit', 200, 'scheduled_at', now())
    );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;