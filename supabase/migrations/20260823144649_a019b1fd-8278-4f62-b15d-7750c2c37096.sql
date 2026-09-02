-- 1. Fire the booking-confirmation email when a booking is accepted
CREATE OR REPLACE FUNCTION public.trg_booking_accepted_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'CRON_SECRET'
      LIMIT 1;
    PERFORM net.http_post(
      url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/booking-email-trigger',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      ),
      body := jsonb_build_object('booking_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_accepted_email ON public.vehicle_booking_requests;
CREATE TRIGGER trg_booking_accepted_email
  AFTER UPDATE OF status ON public.vehicle_booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_booking_accepted_email();

-- 2. Hourly booking-start reminder (idempotent per booking + start date)
DO $$
BEGIN
  PERFORM cron.unschedule('send-booking-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-booking-reminders',
  '15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/send-booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $cron$
);

-- 3. Admin read access to delivery outcomes (for the realtime monitor page)
GRANT SELECT ON public.email_send_log TO authenticated;
GRANT SELECT ON public.suppressed_emails TO authenticated;

DROP POLICY IF EXISTS "Admins can read email send log" ON public.email_send_log;
CREATE POLICY "Admins can read email send log"
  ON public.email_send_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Admins can read suppressed emails"
  ON public.suppressed_emails FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. Realtime publication for live monitor updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.email_send_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.suppressed_emails;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;