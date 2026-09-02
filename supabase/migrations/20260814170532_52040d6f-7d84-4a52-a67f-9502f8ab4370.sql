ALTER TABLE public.sms_consent_records
  ADD COLUMN IF NOT EXISTS keywords_shown jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS timing_shown jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS program_version text,
  ADD COLUMN IF NOT EXISTS page_url text;

DROP POLICY IF EXISTS "Admins can view all SMS consent records" ON public.sms_consent_records;
CREATE POLICY "Admins can view all SMS consent records"
ON public.sms_consent_records
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));