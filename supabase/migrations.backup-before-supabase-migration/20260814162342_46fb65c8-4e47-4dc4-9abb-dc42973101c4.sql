CREATE TABLE IF NOT EXISTS public.sms_consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  phone_number text,
  consent_type text NOT NULL CHECK (consent_type IN ('service','marketing')),
  granted boolean NOT NULL,
  disclosure_version text NOT NULL,
  disclosure_text text NOT NULL,
  source text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_user ON public.sms_consent_records (user_id, consent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_consent_phone ON public.sms_consent_records (phone_number, created_at DESC);

GRANT SELECT, INSERT ON public.sms_consent_records TO authenticated;
GRANT ALL ON public.sms_consent_records TO service_role;

ALTER TABLE public.sms_consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own SMS consent records" ON public.sms_consent_records;
CREATE POLICY "Users can view their own SMS consent records"
ON public.sms_consent_records FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_admin_privilege(auth.uid(), 'communications'));

DROP POLICY IF EXISTS "Users can record their own SMS consent" ON public.sms_consent_records;
CREATE POLICY "Users can record their own SMS consent"
ON public.sms_consent_records FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
