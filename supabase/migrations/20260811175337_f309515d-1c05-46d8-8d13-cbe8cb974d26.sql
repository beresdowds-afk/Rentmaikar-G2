CREATE TABLE public.outbound_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  region text,
  provider text,
  recipient_masked text,
  notification_type text,
  decision text NOT NULL,
  reason text,
  message_id text,
  function_name text,
  user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.outbound_decision_log TO authenticated;
GRANT ALL ON public.outbound_decision_log TO service_role;

ALTER TABLE public.outbound_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read outbound decision log"
ON public.outbound_decision_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_outbound_decision_log_created_at ON public.outbound_decision_log (created_at DESC);
CREATE INDEX idx_outbound_decision_log_channel ON public.outbound_decision_log (channel, decision, created_at DESC);
CREATE INDEX idx_outbound_decision_log_region ON public.outbound_decision_log (region, created_at DESC);