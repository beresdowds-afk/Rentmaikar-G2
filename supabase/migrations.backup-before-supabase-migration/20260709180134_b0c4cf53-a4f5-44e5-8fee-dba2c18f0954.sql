
ALTER TABLE public.referee_verifications
  ADD COLUMN IF NOT EXISTS attestation_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS attestation_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS attestation_response TEXT,
  ADD COLUMN IF NOT EXISTS attestation_comments TEXT,
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attestation_sent_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referee_attestation_status_chk') THEN
    ALTER TABLE public.referee_verifications
      ADD CONSTRAINT referee_attestation_status_chk
      CHECK (attestation_status IN ('not_sent','sent','attested_positive','attested_negative','expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referee_verifications_token
  ON public.referee_verifications(attestation_token);
