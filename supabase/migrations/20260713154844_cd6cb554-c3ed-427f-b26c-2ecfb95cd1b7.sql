CREATE OR REPLACE FUNCTION public.log_document_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
    VALUES (
      COALESCE(NEW.verified_by, auth.uid()),
      'document_verification_failed',
      'user_documents',
      NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'document_type', NEW.document_type,
        'document_category', NEW.document_category,
        'vehicle_id', NEW.vehicle_id,
        'rejection_reason', NEW.rejection_reason,
        'file_name', NEW.file_name,
        'rejected_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_document_rejection ON public.user_documents;
CREATE TRIGGER trg_log_document_rejection
AFTER UPDATE OF status ON public.user_documents
FOR EACH ROW
EXECUTE FUNCTION public.log_document_rejection();

ALTER TABLE public.user_documents REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_documents'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_documents';
  END IF;
END $$;