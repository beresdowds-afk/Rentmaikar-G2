-- 1. Per-user email notification preferences
CREATE TABLE IF NOT EXISTS public.email_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_confirmations boolean NOT NULL DEFAULT true,
  booking_reminders boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_notification_preferences TO authenticated;
GRANT ALL ON public.email_notification_preferences TO service_role;

ALTER TABLE public.email_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own email preferences" ON public.email_notification_preferences;
CREATE POLICY "Users manage own email preferences"
  ON public.email_notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read email preferences" ON public.email_notification_preferences;
CREATE POLICY "Admins can read email preferences"
  ON public.email_notification_preferences FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Admin read access to worker ingest runs (for the GPS tracking status page)
GRANT SELECT ON public.telemetry_ingest_runs TO authenticated;

DROP POLICY IF EXISTS "Admins can read telemetry ingest runs" ON public.telemetry_ingest_runs;
CREATE POLICY "Admins can read telemetry ingest runs"
  ON public.telemetry_ingest_runs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 3. GPS worker stall watchdog — runs every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('gps-worker-watchdog');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'gps-worker-watchdog',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/gps-worker-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $cron$
);