-- =============================================================================
-- Enterprise Email Architecture Hardening
-- =============================================================================
-- Additive, idempotent migration providing:
--   1. public.email_webhook_events for signed Resend/Svix webhook deduplication.
--   2. Expanded public.email_send_log status check constraint aligned with
--      accepted, delivered, rate_limited, dlq, bounced, complained, and suppressed.
--   3. Case-insensitive suppression lookup index on public.suppressed_emails.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  email_id text,
  recipient_email text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_webhook_events_type_processed
  ON public.email_webhook_events (event_type, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_webhook_events_email_id
  ON public.email_webhook_events (email_id)
  WHERE email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_webhook_events_recipient
  ON public.email_webhook_events (lower(recipient_email))
  WHERE recipient_email IS NOT NULL;

ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_webhook_events FROM anon, authenticated;
GRANT SELECT ON public.email_webhook_events TO authenticated;
GRANT ALL ON public.email_webhook_events TO service_role;

DROP POLICY IF EXISTS "Admins view email webhook events" ON public.email_webhook_events;
CREATE POLICY "Admins view email webhook events"
  ON public.email_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service role manages email webhook events" ON public.email_webhook_events;
CREATE POLICY "Service role manages email webhook events"
  ON public.email_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure email_send_log supports all canonical lifecycle states emitted by
-- rentmaikar-backend and signed Resend webhooks.
DO $$
BEGIN
  IF to_regclass('public.email_send_log') IS NOT NULL THEN
    ALTER TABLE public.email_send_log
      DROP CONSTRAINT IF EXISTS email_send_log_status_check;

    ALTER TABLE public.email_send_log
      ADD CONSTRAINT email_send_log_status_check
      CHECK (
        status IN (
          'pending',
          'sent',
          'accepted',
          'delivered',
          'bounced',
          'complained',
          'failed',
          'dlq',
          'suppressed',
          'rate_limited'
        )
      );
  END IF;
END
$$;

-- Case-insensitive lookup index for fail-closed suppression checks
DO $$
BEGIN
  IF to_regclass('public.suppressed_emails') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_suppressed_emails_lower_email
      ON public.suppressed_emails (lower(email));
  END IF;
END
$$;
