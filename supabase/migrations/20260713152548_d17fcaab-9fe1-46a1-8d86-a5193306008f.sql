
CREATE TABLE IF NOT EXISTS public.document_export_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exporter_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  vehicle_id UUID,
  document_ids UUID[] NOT NULL DEFAULT '{}',
  document_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'client',
  status TEXT NOT NULL DEFAULT 'completed',
  region TEXT,
  zip_size_bytes BIGINT,
  storage_path TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.document_export_audit TO authenticated;
GRANT ALL ON public.document_export_audit TO service_role;

ALTER TABLE public.document_export_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exporter can insert own export audit"
  ON public.document_export_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = exporter_id);

CREATE POLICY "user views own or target export audit"
  ON public.document_export_audit FOR SELECT TO authenticated
  USING (auth.uid() = exporter_id OR auth.uid() = target_user_id);

CREATE POLICY "admins view all export audit"
  ON public.document_export_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'admin_assistant'::app_role));

CREATE INDEX IF NOT EXISTS idx_doc_export_audit_exporter ON public.document_export_audit(exporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_export_audit_target ON public.document_export_audit(target_user_id, created_at DESC);
