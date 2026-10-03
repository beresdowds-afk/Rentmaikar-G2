-- ============================================================================
-- Migration: 20261001091500_evidence_artifacts.sql
-- Tier 2 Feature 34: Cryptographic Evidence Store
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_type text NOT NULL, -- 'document', 'inspection', 'legal_agreement', 'incident_photo', 'referee_attestation', 'appeal'
  source_table text NOT NULL,
  source_id text NOT NULL,
  storage_bucket text,
  storage_path text,
  content_sha256 text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid REFERENCES auth.users(id),
  previous_artifact_hash text,
  custody_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_source
  ON public.evidence_artifacts(source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_type
  ON public.evidence_artifacts(evidence_type);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_sha256
  ON public.evidence_artifacts(content_sha256);

ALTER TABLE public.evidence_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own evidence artifacts" ON public.evidence_artifacts;
CREATE POLICY "Users can read their own evidence artifacts"
  ON public.evidence_artifacts
  FOR SELECT
  TO authenticated
  USING (
    captured_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

DROP POLICY IF EXISTS "Only admins and backend can insert evidence artifacts" ON public.evidence_artifacts;
CREATE POLICY "Only admins and backend can insert evidence artifacts"
  ON public.evidence_artifacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

-- RPC to securely register an evidence artifact with cryptographic custody chaining
CREATE OR REPLACE FUNCTION public.register_evidence_artifact(
  _evidence_type text,
  _source_table text,
  _source_id text,
  _storage_bucket text,
  _storage_path text,
  _content_sha256 text,
  _captured_by uuid,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_prev_hash text;
  v_custody_hash text;
  v_raw_str text;
BEGIN
  -- Fetch hash of most recent artifact for tamper-evident chaining
  SELECT custody_hash
  INTO v_prev_hash
  FROM public.evidence_artifacts
  ORDER BY captured_at DESC
  LIMIT 1;

  v_prev_hash := COALESCE(v_prev_hash, 'GENESIS_EVIDENCE_ROOT_0000000000000000000000000000000000000000000000000000000000000000');

  -- Canonical string: artifact_id + content_sha256 + captured_at + captured_by + previous_artifact_hash
  v_raw_str := v_id::text || ':' || _content_sha256 || ':' || v_now::text || ':' || COALESCE(_captured_by::text, 'system') || ':' || v_prev_hash;
  v_custody_hash := encode(digest(v_raw_str, 'sha256'), 'hex');

  INSERT INTO public.evidence_artifacts (
    id,
    evidence_type,
    source_table,
    source_id,
    storage_bucket,
    storage_path,
    content_sha256,
    captured_at,
    captured_by,
    previous_artifact_hash,
    custody_hash,
    metadata
  ) VALUES (
    v_id,
    _evidence_type,
    _source_table,
    _source_id,
    _storage_bucket,
    _storage_path,
    _content_sha256,
    v_now,
    _captured_by,
    v_prev_hash,
    v_custody_hash,
    _metadata
  );

  RETURN v_id;
END;
$$;
