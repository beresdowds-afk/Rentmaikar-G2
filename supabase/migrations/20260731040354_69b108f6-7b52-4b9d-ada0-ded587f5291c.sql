ALTER TABLE public.application_recovery_requests
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS "Applicants upload own appeal documents" ON storage.objects;
CREATE POLICY "Applicants upload own appeal documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'appeal-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Applicants read own appeal documents" ON storage.objects;
CREATE POLICY "Applicants read own appeal documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'appeal-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.can_review_applications()
  )
);

DROP POLICY IF EXISTS "Applicants delete own appeal documents" ON storage.objects;
CREATE POLICY "Applicants delete own appeal documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'appeal-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE OR REPLACE FUNCTION public.request_application_recovery(
  _app_id uuid,
  _reason text,
  _documents jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_docs jsonb := COALESCE(_documents, '[]'::jsonb);
  v_doc jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Please describe why this application should be reconsidered (min 10 characters)'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_docs) <> 'array' THEN
    RAISE EXCEPTION 'Supporting documents must be a list' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_docs) > 10 THEN
    RAISE EXCEPTION 'You can attach at most 10 supporting documents' USING ERRCODE = '22023';
  END IF;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(v_docs) LOOP
    IF COALESCE(v_doc ->> 'path', '') NOT LIKE (v_uid::text || '/%') THEN
      RAISE EXCEPTION 'Invalid supporting document reference' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.applications
     WHERE id = _app_id AND user_id = v_uid AND status = 'rejected'
  ) THEN
    RAISE EXCEPTION 'No rejected application found for this account' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.application_recovery_requests
     WHERE application_id = _app_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'An appeal is already open for this application' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.application_recovery_requests (application_id, requested_by, reason, documents)
  VALUES (_app_id, v_uid, btrim(_reason), v_docs)
  RETURNING id INTO v_id;

  UPDATE public.applications
     SET recovery_status = 'requested', updated_at = now()
   WHERE id = _app_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_application_recovery(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_application_recovery(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_application_appeals()
RETURNS TABLE (
  id uuid,
  application_id uuid,
  application_type text,
  application_status text,
  rejection_reason text,
  reason text,
  documents jsonb,
  status text,
  resolution_notes text,
  reviewed_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
         r.application_id,
         a.application_type::text,
         a.status::text,
         a.rejection_reason,
         r.reason,
         r.documents,
         r.status,
         r.resolution_notes,
         r.reviewed_at,
         r.created_at
    FROM public.application_recovery_requests r
    JOIN public.applications a ON a.id = r.application_id
   WHERE r.requested_by = auth.uid()
   ORDER BY r.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.my_application_appeals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_application_appeals() TO authenticated;