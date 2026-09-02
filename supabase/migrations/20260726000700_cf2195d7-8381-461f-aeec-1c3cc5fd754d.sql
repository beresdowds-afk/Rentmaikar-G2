
-- Add per-user Persona notification frequency preference.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS persona_notification_frequency TEXT
    NOT NULL DEFAULT 'realtime'
    CHECK (persona_notification_frequency IN ('realtime','daily_digest','off'));

COMMENT ON COLUMN public.profiles.persona_notification_frequency IS
  'How to notify the user about Persona identity verification status changes: realtime (email on each change), daily_digest (batched email once per day), off (in-app only).';

-- Buffer of pending persona status changes for the digest.
CREATE TABLE IF NOT EXISTS public.persona_status_digest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inquiry_id TEXT,
  status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
GRANT SELECT ON public.persona_status_digest_queue TO authenticated;
GRANT ALL ON public.persona_status_digest_queue TO service_role;
ALTER TABLE public.persona_status_digest_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own digest queue"
  ON public.persona_status_digest_queue FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS persona_status_digest_pending_idx
  ON public.persona_status_digest_queue (user_id) WHERE sent_at IS NULL;
