ALTER TABLE public.user_documents
  ADD COLUMN IF NOT EXISTS suggested_expiry_date date,
  ADD COLUMN IF NOT EXISTS expiry_recognition_status text,
  ADD COLUMN IF NOT EXISTS expiry_recognized_at timestamptz;

ALTER TABLE public.user_documents
  ADD CONSTRAINT user_documents_expiry_recognition_status_check
  CHECK (expiry_recognition_status IS NULL OR expiry_recognition_status IN ('recognized', 'not_found', 'error'));

CREATE OR REPLACE FUNCTION public.guard_document_expiry_recognition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND ROW(NEW.suggested_expiry_date, NEW.expiry_recognition_status, NEW.expiry_recognized_at)
         IS DISTINCT FROM ROW(OLD.suggested_expiry_date, OLD.expiry_recognition_status, OLD.expiry_recognized_at) THEN
    RAISE EXCEPTION 'Expiry recognition results are server-controlled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_document_expiry_recognition
  BEFORE UPDATE ON public.user_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_expiry_recognition();
