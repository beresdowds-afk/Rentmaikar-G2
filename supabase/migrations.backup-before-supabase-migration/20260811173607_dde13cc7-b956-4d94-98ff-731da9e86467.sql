DROP POLICY IF EXISTS "Anyone can read platform kv" ON public.platform_kv_settings;

CREATE POLICY "Public can read non-sensitive platform kv"
ON public.platform_kv_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('phone_otp_provider', 'persona_verification'));