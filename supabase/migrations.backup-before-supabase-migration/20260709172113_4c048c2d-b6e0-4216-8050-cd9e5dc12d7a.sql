CREATE TABLE IF NOT EXISTS public.region_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  phone_prefix TEXT NOT NULL,
  timezone TEXT,
  primary_language TEXT DEFAULT 'en',
  sms_provider TEXT NOT NULL DEFAULT 'twilio',
  voice_provider TEXT NOT NULL DEFAULT 'twilio',
  whatsapp_provider TEXT NOT NULL DEFAULT 'twilio',
  payment_gateway TEXT NOT NULL DEFAULT 'paypal',
  support_hours TEXT,
  whatsapp_number TEXT,
  sms_number TEXT,
  flag_emoji TEXT,
  cultural_tone TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  build_log JSONB DEFAULT '[]'::jsonb,
  build_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.region_localized_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.region_definitions(id) ON DELETE CASCADE,
  content_key TEXT NOT NULL,
  content JSONB NOT NULL,
  generated_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(region_id, content_key)
);

GRANT SELECT ON public.region_definitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_definitions TO authenticated;
GRANT ALL ON public.region_definitions TO service_role;

GRANT SELECT ON public.region_localized_content TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.region_localized_content TO authenticated;
GRANT ALL ON public.region_localized_content TO service_role;

ALTER TABLE public.region_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_localized_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view ready regions"
  ON public.region_definitions FOR SELECT
  USING (status IN ('ready','published'));

CREATE POLICY "Admins manage regions"
  ON public.region_definitions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can view content for ready regions"
  ON public.region_localized_content FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.region_definitions r
    WHERE r.id = region_id AND r.status IN ('ready','published')
  ));

CREATE POLICY "Admins manage region content"
  ON public.region_localized_content FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER region_definitions_updated
  BEFORE UPDATE ON public.region_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER region_localized_content_updated
  BEFORE UPDATE ON public.region_localized_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();