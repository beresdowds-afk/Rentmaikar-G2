GRANT SELECT ON public.security_deposit_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_deposit_settings TO authenticated;
GRANT ALL ON public.security_deposit_settings TO service_role;