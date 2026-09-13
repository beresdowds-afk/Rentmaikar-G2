-- Explicitly disable Persona verification by default.
-- Admins can enable it from the Admin Dashboard at any time.

INSERT INTO public.platform_kv_settings (key, value)
VALUES ('persona_verification', jsonb_build_object('enabled', false))
ON CONFLICT (key) DO UPDATE
SET value = jsonb_build_object('enabled', false);
