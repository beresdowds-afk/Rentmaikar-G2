
-- Two-factor authentication settings per user
CREATE TABLE public.two_factor_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  phone_number TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'sms',
  enabled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.two_factor_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own 2FA settings"
  ON public.two_factor_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own 2FA settings"
  ON public.two_factor_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own 2FA settings"
  ON public.two_factor_settings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all 2FA settings"
  ON public.two_factor_settings FOR ALL
  USING (is_admin());

CREATE TRIGGER update_two_factor_settings_updated_at
  BEFORE UPDATE ON public.two_factor_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Two-factor audit log for compliance tracking
CREATE TABLE public.two_factor_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  channel TEXT,
  phone_number TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.two_factor_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own 2FA audit log"
  ON public.two_factor_audit_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert 2FA audit logs"
  ON public.two_factor_audit_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all 2FA audit logs"
  ON public.two_factor_audit_log FOR SELECT
  USING (is_admin());

-- Auto-create 2FA settings when a user signs up (via trigger on profiles)
CREATE OR REPLACE FUNCTION public.auto_create_2fa_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _is_mandatory BOOLEAN;
BEGIN
  -- Check user role to determine if 2FA is mandatory
  SELECT role INTO _role FROM public.user_roles WHERE user_id = NEW.user_id LIMIT 1;
  
  _is_mandatory := CASE 
    WHEN _role IN ('admin', 'owner') THEN true
    ELSE false
  END;

  INSERT INTO public.two_factor_settings (user_id, is_mandatory, is_enabled)
  VALUES (NEW.user_id, _is_mandatory, false)
  ON CONFLICT (user_id) DO UPDATE
  SET is_mandatory = _is_mandatory, updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER create_2fa_settings_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_2fa_settings();
