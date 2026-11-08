UPDATE storage.buckets
   SET public = false
 WHERE id IN ('user-documents', 'weekly-inspection-photos');

DROP POLICY IF EXISTS "Users can upload their own documents to storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their inspection photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their inspection photos" ON storage.objects;

DROP POLICY IF EXISTS "Users can upload their own documents" ON public.user_documents;
DROP POLICY IF EXISTS "Users can update their own pending documents" ON public.user_documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON public.user_documents;

CREATE POLICY "Admins can view all documents"
  ON public.user_documents
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can review documents"
  ON public.user_documents
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.prevent_user_document_asset_replacement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.user_id,
    NEW.document_type,
    NEW.document_category,
    NEW.file_path,
    NEW.file_name,
    NEW.file_size,
    NEW.mime_type,
    NEW.vehicle_id,
    NEW.content_sha256,
    NEW.document_version,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.user_id,
    OLD.document_type,
    OLD.document_category,
    OLD.file_path,
    OLD.file_name,
    OLD.file_size,
    OLD.mime_type,
    OLD.vehicle_id,
    OLD.content_sha256,
    OLD.document_version,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Document evidence identity and storage metadata are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_user_document_asset_replacement ON public.user_documents;
CREATE TRIGGER prevent_user_document_asset_replacement
  BEFORE UPDATE ON public.user_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_document_asset_replacement();

ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.storage_upload_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES auth.users(id),
  owner_id uuid REFERENCES auth.users(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  purpose text NOT NULL CHECK (
    purpose IN ('user_document', 'rideshare_profile', 'inspection_image', 'damage_evidence')
  ),
  resource_type text NOT NULL,
  resource_key text NOT NULL,
  resource_id text,
  document_category text,
  document_type text,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  mime_type text NOT NULL,
  content_sha256 text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending',
  state text NOT NULL DEFAULT 'pending_storage'
    CHECK (state IN ('pending_storage', 'registered', 'reconciliation_required', 'failed', 'revoked')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_storage_upload_reconciliation_pending
  ON public.storage_upload_reconciliation (state, created_at)
  WHERE state IN ('pending_storage', 'reconciliation_required');
CREATE INDEX IF NOT EXISTS idx_storage_upload_reconciliation_resource
  ON public.storage_upload_reconciliation (resource_type, resource_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_upload_reconciliation_content
  ON public.storage_upload_reconciliation (
    uploader_id,
    purpose,
    COALESCE(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid),
    resource_key,
    content_sha256
  )
  WHERE state IN ('pending_storage', 'registered', 'reconciliation_required');

ALTER TABLE public.storage_upload_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_upload_reconciliation FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.storage_upload_reconciliation TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_artifacts_storage_path
  ON public.evidence_artifacts (storage_bucket, storage_path)
  WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL;
