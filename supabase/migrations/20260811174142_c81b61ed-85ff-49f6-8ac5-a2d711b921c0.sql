INSERT INTO public.platform_kv_settings (key, value)
VALUES ('forwarding_config', '{"call": true, "sms": true, "whatsapp": true, "email": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;