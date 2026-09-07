CREATE TABLE IF NOT EXISTS public.security_deposit_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL UNIQUE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_deposit_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_deposit_settings TO authenticated;
GRANT ALL ON public.security_deposit_settings TO service_role;

ALTER TABLE public.security_deposit_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.security_deposit_settings'::regclass AND polname='Admins can manage security deposit settings') THEN
    CREATE POLICY "Admins can manage security deposit settings"
      ON public.security_deposit_settings FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.security_deposit_settings'::regclass AND polname='Anyone can view active security deposit settings') THEN
    CREATE POLICY "Anyone can view active security deposit settings"
      ON public.security_deposit_settings FOR SELECT
      USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.security_deposit_settings'::regclass AND tgname='update_security_deposit_settings_updated_at') THEN
    CREATE TRIGGER update_security_deposit_settings_updated_at
      BEFORE UPDATE ON public.security_deposit_settings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_staff_role(p_user_id uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_role NOT IN (
        'admin_assistant',
        'support'
    ) THEN
        RAISE EXCEPTION 'Unauthorized role assignment';
    END IF;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_unique_credentials(p_email text, p_phone text, p_username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)) THEN
        RETURN false;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = p_phone) THEN
        RETURN false;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(p_username)) THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$function$;