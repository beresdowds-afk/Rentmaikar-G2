
CREATE TABLE IF NOT EXISTS public.phone_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  channel text NOT NULL DEFAULT 'sms',
  attempts smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_phone ON public.phone_otp_codes(phone, created_at DESC);

GRANT ALL ON public.phone_otp_codes TO service_role;

ALTER TABLE public.phone_otp_codes ENABLE ROW LEVEL SECURITY;

-- No end-user access; only service_role writes/reads via edge function
DROP POLICY IF EXISTS "Deny all client access" ON public.phone_otp_codes;
CREATE POLICY "Deny all client access" ON public.phone_otp_codes
  FOR SELECT TO authenticated USING (false);
