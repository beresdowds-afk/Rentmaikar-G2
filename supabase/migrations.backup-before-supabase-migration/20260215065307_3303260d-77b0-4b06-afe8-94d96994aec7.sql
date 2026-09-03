
-- Store editable platform email addresses (replaces hardcoded email-config)
CREATE TABLE public.platform_email_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  sender_name TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.platform_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email config"
  ON public.platform_email_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can read email config"
  ON public.platform_email_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_platform_email_config_updated_at
  BEFORE UPDATE ON public.platform_email_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with current hardcoded values
INSERT INTO public.platform_email_config (key, email, sender_name, description) VALUES
  ('support', 'support@rentmaikar.com', 'Rentmaikar Support', 'Customer support inbox'),
  ('noreply', 'noreply@rentmaikar.com', 'Rentmaikar', 'Transactional/automated notifications'),
  ('admin', 'admin@rentmaikar.com', 'Rentmaikar Admin', 'Administrative alerts'),
  ('privacy', 'privacy@rentmaikar.com', NULL, 'Legal/Privacy inquiries'),
  ('dpo', 'dpo@rentmaikar.com', NULL, 'Data Protection Officer'),
  ('payments', 'payments@rentmaikar.com', NULL, 'Payment inquiries'),
  ('documents', 'documents@rentmaikar.com', NULL, 'Document submissions'),
  ('legal', 'legal@rentmaikar.com', NULL, 'Legal inquiries'),
  ('nigeria', 'nigeria@rentmaikar.com', NULL, 'Nigeria regional inbox'),
  ('usa', 'usa@rentmaikar.com', NULL, 'USA regional inbox');
