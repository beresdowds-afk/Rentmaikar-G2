-- ── In-app messaging ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.in_app_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT 'Rentmaikar Support',
  category text NOT NULL DEFAULT 'general',
  subject text,
  body text NOT NULL,
  link_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_messages_recipient
  ON public.in_app_messages (recipient_id, created_at DESC);

GRANT SELECT, UPDATE ON public.in_app_messages TO authenticated;
GRANT INSERT ON public.in_app_messages TO authenticated;
GRANT ALL ON public.in_app_messages TO service_role;

ALTER TABLE public.in_app_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their in-app messages"
  ON public.in_app_messages FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Recipients mark their in-app messages read"
  ON public.in_app_messages FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Admins send in-app messages"
  ON public.in_app_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage in-app messages"
  ON public.in_app_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.mark_in_app_messages_read(_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.in_app_messages
       SET read_at = now()
     WHERE recipient_id = auth.uid()
       AND read_at IS NULL
       AND id = ANY(_ids)
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

-- ── SMS dead-letter / stuck-message retry state ──────────────────────
CREATE TABLE IF NOT EXISTS public.sms_dlq_retry_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_key text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'sms',
  recipient_phone text NOT NULL,
  body text,
  template_name text,
  user_id uuid,
  region text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  paused boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_dlq_pending
  ON public.sms_dlq_retry_state (paused, resolved_at, next_attempt_at);

GRANT SELECT ON public.sms_dlq_retry_state TO authenticated;
GRANT ALL ON public.sms_dlq_retry_state TO service_role;

ALTER TABLE public.sms_dlq_retry_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read sms dlq state"
  ON public.sms_dlq_retry_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sms_dlq_updated_at
  BEFORE UPDATE ON public.sms_dlq_retry_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Admin SMS delivery summary ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sms_delivery_stats(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(_hours, 720)));
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'queued', count(*) FILTER (WHERE event_type = 'queued'),
    'sent', count(*) FILTER (WHERE event_type = 'sent'),
    'delivered', count(*) FILTER (WHERE event_type IN ('delivered','read')),
    'failed', count(*) FILTER (WHERE event_type IN ('failed','rejected','undelivered')),
    'bounced', count(*) FILTER (WHERE event_type = 'blocked'),
    'complained', count(*) FILTER (WHERE event_type IN ('opted_out','unsubscribed')),
    'total', count(*)
  )
  INTO _result
  FROM public.messaging_events
  WHERE created_at >= _since
    AND direction = 'outbound'
    AND channel IN ('sms','whatsapp');

  SELECT _result
    || jsonb_build_object(
      'dlq', (SELECT count(*) FROM public.sms_dlq_retry_state WHERE resolved_at IS NULL AND NOT paused),
      'dlq_paused', (SELECT count(*) FROM public.sms_dlq_retry_state WHERE resolved_at IS NULL AND paused)
    )
  INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sms_delivery_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_in_app_messages_read(uuid[]) TO authenticated;