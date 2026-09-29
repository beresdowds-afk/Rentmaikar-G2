-- Migration: Formalize OTP Challenges Schema
-- Extends public.phone_otp_codes with formal challenge representation:
-- identity, user_id, purpose, status, correlation_id, provider, provider_message_id, metadata

ALTER TABLE public.phone_otp_codes
  ADD COLUMN IF NOT EXISTS identity text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'auth',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Backfill identity from phone where identity is not yet set
UPDATE public.phone_otp_codes
SET identity = phone
WHERE identity IS NULL;

-- Fast index for identity + purpose lookups
CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_identity_purpose
  ON public.phone_otp_codes(identity, purpose, created_at DESC);

-- Fast index for correlation ID tracking and audit trail
CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_correlation_id
  ON public.phone_otp_codes(correlation_id)
  WHERE correlation_id IS NOT NULL;
