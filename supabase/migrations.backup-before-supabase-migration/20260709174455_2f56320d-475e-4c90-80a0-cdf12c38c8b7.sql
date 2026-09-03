
CREATE TABLE IF NOT EXISTS public.telemetry_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (name IN ('emqx','traccar')),
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  base_url TEXT,
  api_key_secret_name TEXT,
  region_scope TEXT NOT NULL DEFAULT 'global',
  priority INT NOT NULL DEFAULT 100,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, region_scope)
);
GRANT SELECT ON public.telemetry_providers TO authenticated;
GRANT ALL ON public.telemetry_providers TO service_role;
ALTER TABLE public.telemetry_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage telemetry providers" ON public.telemetry_providers
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated read telemetry providers" ON public.telemetry_providers
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_telemetry_providers_updated
  BEFORE UPDATE ON public.telemetry_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.telemetry_providers (name, display_name, is_active, api_key_secret_name, region_scope, priority)
VALUES ('emqx','EMQX (MQTT)',true,'EMQX_API_KEY','global',10),
       ('traccar','Traccar (REST)',false,'TRACCAR_API_TOKEN','global',20)
ON CONFLICT (name, region_scope) DO NOTHING;

ALTER TABLE public.iot_devices ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'emqx';

CREATE TABLE IF NOT EXISTS public.persona_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('self','referee')),
  subject_ref TEXT,
  inquiry_id TEXT UNIQUE,
  template_id TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','approved','declined','needs_review','expired')),
  verified_at TIMESTAMPTZ,
  mismatch_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.persona_inquiries TO authenticated;
GRANT ALL ON public.persona_inquiries TO service_role;
ALTER TABLE public.persona_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own persona inquiries" ON public.persona_inquiries
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own persona inquiries" ON public.persona_inquiries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage persona inquiries" ON public.persona_inquiries
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_persona_inquiries_updated
  BEFORE UPDATE ON public.persona_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.referee_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  user_id UUID NOT NULL,
  referee_index INT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_type TEXT,
  id_number TEXT,
  persona_inquiry_id UUID REFERENCES public.persona_inquiries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','verified','mismatch','failed','action_required')),
  mismatch_reason TEXT,
  last_notified_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(application_id, referee_index)
);
GRANT SELECT, INSERT, UPDATE ON public.referee_verifications TO authenticated;
GRANT ALL ON public.referee_verifications TO service_role;
ALTER TABLE public.referee_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own referee verifications" ON public.referee_verifications
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users update own referee verifications" ON public.referee_verifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage referee verifications" ON public.referee_verifications
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_referee_verifications_updated
  BEFORE UPDATE ON public.referee_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referees_verification_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (referees_verification_status IN ('pending','running','verified','action_required','failed'));

ALTER TABLE public.region_definitions
  ADD COLUMN IF NOT EXISTS payment_gateways TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS default_payment_gateway TEXT;

UPDATE public.region_definitions
SET payment_gateways = ARRAY['paypal','stripe','paystack'],
    default_payment_gateway = 'paypal',
    payment_gateway = COALESCE(payment_gateway,'paypal')
WHERE country_code = 'US';

UPDATE public.region_definitions
SET payment_gateways = ARRAY['opay','paystack','flutterwave'],
    default_payment_gateway = 'opay',
    payment_gateway = COALESCE(payment_gateway,'opay')
WHERE country_code = 'NG';
