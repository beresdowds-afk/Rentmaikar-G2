-- ============================================================================
-- Migration: 20261001090600_referee_token_hardening.sql
-- Tier 2 Feature 24: Referee Attestation Portal Hardening
-- ============================================================================

ALTER TABLE public.referee_verifications
  ADD COLUMN IF NOT EXISTS attestation_token_expires_at timestamptz;

-- Set default 14-day expiry for any existing unexpired records
UPDATE public.referee_verifications
SET attestation_token_expires_at = created_at + interval '14 days'
WHERE attestation_token_expires_at IS NULL AND created_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referee_attestation_token
  ON public.referee_verifications(attestation_token);
