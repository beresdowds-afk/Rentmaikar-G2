CREATE TABLE IF NOT EXISTS public.email_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  purpose text NOT NULL,
  recipient text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  UNIQUE (purpose, idempotency_key)
);

GRANT ALL ON public.email_idempotency_keys TO service_role;

ALTER TABLE public.email_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages email idempotency keys"
  ON public.email_idempotency_keys FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS email_idempotency_keys_expires_idx
  ON public.email_idempotency_keys (expires_at);