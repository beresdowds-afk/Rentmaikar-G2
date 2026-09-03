-- Repair: security_deposit_settings was referenced by later migrations
-- but its CREATE TABLE migration was missing from the repository.

CREATE TABLE public.security_deposit_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(region)
);

-- Seed the baseline values expected by the existing update migration.
-- The following migration will change Nigeria from 100 to 100,000.
INSERT INTO public.security_deposit_settings
  (region, amount, currency, description)
VALUES
  ('USA', 200.00, 'USD', 'Security deposit for USA drivers ($200)'),
  ('Nigeria', 100.00, 'NGN', 'Security deposit for Nigeria drivers (₦100)');

-- Enable Row Level Security.
ALTER TABLE public.security_deposit_settings ENABLE ROW LEVEL SECURITY;

-- Public users can read active security-deposit settings.
CREATE POLICY "Anyone can view active security deposits"
  ON public.security_deposit_settings
  FOR SELECT
  USING (is_active = true);

-- Administrators can manage security-deposit settings.
CREATE POLICY "Admins can manage security deposits"
  ON public.security_deposit_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Keep updated_at consistent with the rest of the project.
CREATE TRIGGER update_security_deposit_settings_updated_at
  BEFORE UPDATE ON public.security_deposit_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
