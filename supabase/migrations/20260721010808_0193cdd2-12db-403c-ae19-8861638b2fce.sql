CREATE OR REPLACE FUNCTION public.fanout_admin_onboarding_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_title TEXT;
  v_body TEXT;
  v_user_email TEXT;
  v_previous_stage TEXT := NEW.previous_stage;
  v_new_stage TEXT := NEW.new_stage;
  v_previous_access_level TEXT := NEW.previous_access_level;
  v_new_access_level TEXT := NEW.new_access_level;
BEGIN
  IF NEW.event_type IN ('access_granted','grant_full_access') THEN
    v_kind := 'access_grant';
  ELSIF NEW.event_type IN ('access_revoked','revoke_full_access') THEN
    v_kind := 'access_revoke';
  ELSIF NEW.event_type IN ('stage_advanced','stage_changed') THEN
    v_kind := 'onboarding_stage';
  ELSE
    RETURN NEW;
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE user_id = NEW.user_id;

  v_title := CASE v_kind
    WHEN 'access_grant'     THEN 'Full access granted'
    WHEN 'access_revoke'    THEN 'Full access revoked'
    WHEN 'onboarding_stage' THEN 'Onboarding stage advanced'
  END;

  v_body := COALESCE(v_user_email, NEW.user_id::text)
            || CASE v_kind
                 WHEN 'onboarding_stage' THEN ' → ' || COALESCE(v_new_stage, '(unknown)')
                 WHEN 'access_grant'     THEN ' now has full dashboard access'
                 WHEN 'access_revoke'    THEN ' had full access revoked'
               END;

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, related_stage, related_access_level, metadata)
  SELECT
    ur.user_id,
    v_kind,
    v_title,
    v_body,
    NEW.user_id,
    v_new_stage,
    v_new_access_level,
    jsonb_build_object(
      'audit_id', NEW.id,
      'event_type', NEW.event_type,
      'previous_stage', v_previous_stage,
      'new_stage', v_new_stage,
      'previous_access_level', v_previous_access_level,
      'new_access_level', v_new_access_level,
      'error_class', NEW.error_class
    )
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','admin_assistant');

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.legal_agreement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  agreement_type TEXT NOT NULL DEFAULT 'vehicle_rental',
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, region, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_agreement_templates TO authenticated;
GRANT ALL ON public.legal_agreement_templates TO service_role;

ALTER TABLE public.legal_agreement_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage legal agreement templates" ON public.legal_agreement_templates;
CREATE POLICY "Admins manage legal agreement templates"
  ON public.legal_agreement_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS legal_agreement_templates_lookup_idx
  ON public.legal_agreement_templates (agreement_type, region, is_active, updated_at DESC);

DROP TRIGGER IF EXISTS update_legal_agreement_templates_updated_at ON public.legal_agreement_templates;
CREATE TRIGGER update_legal_agreement_templates_updated_at
  BEFORE UPDATE ON public.legal_agreement_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.legal_agreement_templates
  (template_key, agreement_type, region, title, version, content, is_active)
VALUES
  (
    'vehicle_rental_standard',
    'vehicle_rental',
    'USA',
    'Vehicle Rental Agreement - USA',
    '1.0',
    'VEHICLE RENTAL AGREEMENT\n\nAgreement Date: {{agreement_date}}\n\nPARTIES:\nOwner: {{owner_name}} ({{owner_email}})\nDriver: {{driver_name}} ({{driver_email}})\n\nVEHICLE:\n{{vehicle_year}} {{vehicle_make}} {{vehicle_model}}\nLicense Plate: {{license_plate}}\n{{vin_line}}\n\nNEGOTIATION REFERENCE: {{negotiation_id}}\nAgreed Daily Rate: {{currency}} {{daily_rate}}/day\n\nThis agreement is governed by the RentMaiKar Terms of Use and Privacy Policy. All pricing, payment schedules, platform fees, inspection duties, prohibited activities, and IoT safety terms remain as displayed and accepted on the RentMaiKar platform.',
    true
  ),
  (
    'vehicle_rental_standard',
    'vehicle_rental',
    'Nigeria',
    'Vehicle Rental Agreement - Nigeria',
    '1.0',
    'VEHICLE RENTAL AGREEMENT\n\nAgreement Date: {{agreement_date}}\n\nPARTIES:\nOwner: {{owner_name}} ({{owner_email}})\nDriver: {{driver_name}} ({{driver_email}})\n\nVEHICLE:\n{{vehicle_year}} {{vehicle_make}} {{vehicle_model}}\nLicense Plate: {{license_plate}}\n{{vin_line}}\n\nNEGOTIATION REFERENCE: {{negotiation_id}}\nAgreed Daily Rate: {{currency}} {{daily_rate}}/day\n\nThis agreement is governed by the RentMaiKar Terms of Use and Privacy Policy. All pricing, payment schedules, platform fees, inspection duties, prohibited activities, IoT safety terms, and Nigeria-specific verification obligations remain as displayed and accepted on the RentMaiKar platform.',
    true
  )
ON CONFLICT (template_key, region, version) DO NOTHING;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.onboarding_stage_audit TO authenticated;
GRANT ALL ON public.onboarding_stage_audit TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_step_configs TO authenticated;
GRANT ALL ON public.tour_step_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_versions TO authenticated;
GRANT SELECT ON public.policy_versions TO anon;
GRANT ALL ON public.policy_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_agreements TO authenticated;
GRANT ALL ON public.legal_agreements TO service_role;
GRANT SELECT ON public.application_audit_log TO authenticated;
GRANT ALL ON public.application_audit_log TO service_role;

REVOKE EXECUTE ON FUNCTION public.fanout_admin_onboarding_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fanout_admin_onboarding_notification() TO service_role;