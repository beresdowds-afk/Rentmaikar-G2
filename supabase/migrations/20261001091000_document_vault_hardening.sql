-- ============================================================================
-- Migration: 20261001091000_document_vault_hardening.sql
-- Tier 2 Feature 25: Profile & Documents Vault Hardening
-- ============================================================================

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_classification text DEFAULT 'restricted',
  ADD COLUMN IF NOT EXISTS retention_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_documents_sha256
  ON public.user_documents(content_sha256);

CREATE INDEX IF NOT EXISTS idx_user_documents_user_type_status
  ON public.user_documents(user_id, document_type, status);
