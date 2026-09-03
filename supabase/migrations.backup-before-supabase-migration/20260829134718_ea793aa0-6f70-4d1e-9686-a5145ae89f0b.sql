-- 1. Agreement PDF reads must be tied to real agreement participation
DROP POLICY IF EXISTS "Authenticated users can read own agreement PDFs" ON storage.objects;

CREATE POLICY "Agreement parties can read agreement PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'agreement-pdfs'
  AND (
    (
      (auth.uid())::text = (storage.foldername(name))[1]
      AND (
        EXISTS (
          SELECT 1 FROM public.legal_agreements la
          WHERE (la.driver_id = auth.uid() OR la.owner_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.rent_to_own_agreements rta
          WHERE (rta.driver_id = auth.uid() OR rta.owner_id = auth.uid())
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.legal_agreements la
      WHERE (la.driver_id = auth.uid() OR la.owner_id = auth.uid())
        AND la.id::text = ANY (storage.foldername(name))
    )
    OR EXISTS (
      SELECT 1 FROM public.rent_to_own_agreements rta
      WHERE (rta.driver_id = auth.uid() OR rta.owner_id = auth.uid())
        AND rta.id::text = ANY (storage.foldername(name))
    )
  )
);

-- 2. Hide internal region build/debug data from non-admin readers
REVOKE SELECT ON public.region_definitions FROM anon, authenticated;

GRANT SELECT (
  id, country_name, country_code, currency, currency_symbol, phone_prefix,
  timezone, primary_language, sms_provider, voice_provider, whatsapp_provider,
  payment_gateway, support_hours, whatsapp_number, sms_number, flag_emoji,
  cultural_tone, status, created_at, updated_at, payment_gateways,
  default_payment_gateway
) ON public.region_definitions TO anon, authenticated;

GRANT ALL ON public.region_definitions TO service_role;