-- 1. DLQ retry state (single-flight + exponential backoff bookkeeping)
CREATE TABLE IF NOT EXISTS public.email_dlq_retry_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  message_key text NOT NULL,
  recipient_email text,
  template_name text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  paused boolean NOT NULL DEFAULT false,
  alerted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_name, message_key)
);

GRANT SELECT ON public.email_dlq_retry_state TO authenticated;
GRANT ALL ON public.email_dlq_retry_state TO service_role;
ALTER TABLE public.email_dlq_retry_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read dlq retry state" ON public.email_dlq_retry_state;
CREATE POLICY "Admins read dlq retry state" ON public.email_dlq_retry_state
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Provider auth failure alerts (Resend 401/403)
CREATE TABLE IF NOT EXISTS public.email_provider_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  status integer NOT NULL,
  recipient_email text,
  subject text,
  payload_excerpt jsonb,
  provider_response text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.email_provider_alerts TO authenticated;
GRANT ALL ON public.email_provider_alerts TO service_role;
ALTER TABLE public.email_provider_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read email provider alerts" ON public.email_provider_alerts;
CREATE POLICY "Admins read email provider alerts" ON public.email_provider_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins acknowledge email provider alerts" ON public.email_provider_alerts;
CREATE POLICY "Admins acknowledge email provider alerts" ON public.email_provider_alerts
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS email_provider_alerts_created_idx
  ON public.email_provider_alerts (created_at DESC);

-- 3. Queue depth stats for the monitoring page (admin-only, reads pgmq internals)
CREATE OR REPLACE FUNCTION public.email_queue_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  q text;
  n bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOREACH q IN ARRAY ARRAY['auth_emails','transactional_emails','auth_emails_dlq','transactional_emails_dlq'] LOOP
    EXECUTE format('SELECT count(*) FROM pgmq.%I', 'q_' || q) INTO n;
    result := result || jsonb_build_object(q, n);
  END LOOP;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.email_queue_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.email_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_stats() TO service_role;