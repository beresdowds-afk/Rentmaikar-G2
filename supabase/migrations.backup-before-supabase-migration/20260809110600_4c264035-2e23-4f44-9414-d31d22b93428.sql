CREATE TABLE public.persona_id_class_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  subject_role text NOT NULL,
  accepted_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_drivers_license boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, subject_role)
);

GRANT SELECT ON public.persona_id_class_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.persona_id_class_rules TO authenticated;
GRANT ALL ON public.persona_id_class_rules TO service_role;

ALTER TABLE public.persona_id_class_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read id class rules"
  ON public.persona_id_class_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage id class rules"
  ON public.persona_id_class_rules FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER update_persona_id_class_rules_updated_at
  BEFORE UPDATE ON public.persona_id_class_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.persona_verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_role text,
  subject_type text,
  region text,
  inquiry_id text,
  template_id text,
  offered_id_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_id_class text,
  status text NOT NULL DEFAULT 'started',
  result text,
  error_code text,
  error_detail text,
  correlation_id text,
  retried_from uuid REFERENCES public.persona_verification_attempts(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_persona_attempts_user ON public.persona_verification_attempts (user_id, created_at DESC);
CREATE INDEX idx_persona_attempts_inquiry ON public.persona_verification_attempts (inquiry_id);

GRANT SELECT, INSERT, UPDATE ON public.persona_verification_attempts TO authenticated;
GRANT ALL ON public.persona_verification_attempts TO service_role;

ALTER TABLE public.persona_verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own persona attempts"
  ON public.persona_verification_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own persona attempts"
  ON public.persona_verification_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users update own persona attempts"
  ON public.persona_verification_attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER update_persona_verification_attempts_updated_at
  BEFORE UPDATE ON public.persona_verification_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.persona_id_class_rules (country_code, subject_role, accepted_classes, requires_drivers_license)
VALUES
  ('US','driver','[{"code":"dl","label":"Driver''s licence"}]'::jsonb, true),
  ('NG','driver','[{"code":"dl","label":"Driver''s licence"}]'::jsonb, true),
  ('US','owner','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"State-issued ID card"},{"code":"pp","label":"Passport"},{"code":"pc","label":"Permanent resident card"},{"code":"mid","label":"Military ID"}]'::jsonb, false),
  ('US','referee','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"State-issued ID card"},{"code":"pp","label":"Passport"},{"code":"pc","label":"Permanent resident card"},{"code":"mid","label":"Military ID"}]'::jsonb, false),
  ('US','proxy','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"State-issued ID card"},{"code":"pp","label":"Passport"},{"code":"pc","label":"Permanent resident card"},{"code":"mid","label":"Military ID"}]'::jsonb, false),
  ('US','admin_assistant','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"State-issued ID card"},{"code":"pp","label":"Passport"}]'::jsonb, false),
  ('US','support_staff','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"State-issued ID card"},{"code":"pp","label":"Passport"}]'::jsonb, false),
  ('NG','owner','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"National ID card (NIN slip)"},{"code":"pp","label":"International passport"},{"code":"vid","label":"Voter''s card"}]'::jsonb, false),
  ('NG','referee','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"National ID card (NIN slip)"},{"code":"pp","label":"International passport"},{"code":"vid","label":"Voter''s card"}]'::jsonb, false),
  ('NG','proxy','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"National ID card (NIN slip)"},{"code":"pp","label":"International passport"},{"code":"vid","label":"Voter''s card"}]'::jsonb, false),
  ('NG','admin_assistant','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"National ID card (NIN slip)"},{"code":"pp","label":"International passport"}]'::jsonb, false),
  ('NG','support_staff','[{"code":"dl","label":"Driver''s licence"},{"code":"id","label":"National ID card (NIN slip)"},{"code":"pp","label":"International passport"}]'::jsonb, false);