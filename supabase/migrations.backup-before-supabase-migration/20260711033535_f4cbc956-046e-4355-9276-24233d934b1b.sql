
-- 1. Region template mapping
CREATE TABLE public.persona_region_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID REFERENCES public.region_definitions(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  inquiry_template_id TEXT,
  environment_id TEXT,
  source_template_id TEXT,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  provision_status TEXT NOT NULL DEFAULT 'pending' CHECK (provision_status IN ('pending','provisioning','ready','error')),
  provision_error TEXT,
  provisioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code)
);

GRANT SELECT ON public.persona_region_templates TO authenticated;
GRANT ALL ON public.persona_region_templates TO service_role;

ALTER TABLE public.persona_region_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active templates"
  ON public.persona_region_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage templates"
  ON public.persona_region_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_persona_region_templates_updated
BEFORE UPDATE ON public.persona_region_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Auto-queue placeholder on new region
CREATE OR REPLACE FUNCTION public.queue_persona_template_for_region()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.persona_region_templates (region_id, country_code, provision_status, auto_generated)
  VALUES (NEW.id, NEW.country_code, 'pending', true)
  ON CONFLICT (country_code) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_region_definition_queue_persona
AFTER INSERT ON public.region_definitions
FOR EACH ROW EXECUTE FUNCTION public.queue_persona_template_for_region();

-- 3. Backfill for existing regions
INSERT INTO public.persona_region_templates (region_id, country_code, provision_status, auto_generated)
SELECT id, country_code, 'pending', false
FROM public.region_definitions
ON CONFLICT (country_code) DO NOTHING;

-- 4. Profile verification columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_inquiry_id TEXT,
  ADD COLUMN IF NOT EXISTS identity_verification_status TEXT;
