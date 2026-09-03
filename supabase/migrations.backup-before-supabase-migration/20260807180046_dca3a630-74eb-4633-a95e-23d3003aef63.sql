ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referee1_email text,
  ADD COLUMN IF NOT EXISTS referee2_email text,
  ADD COLUMN IF NOT EXISTS referee3_email text;

INSERT INTO public.platform_kv_settings (key, value)
VALUES ('persona_verification', jsonb_build_object('enabled', true))
ON CONFLICT (key) DO NOTHING;