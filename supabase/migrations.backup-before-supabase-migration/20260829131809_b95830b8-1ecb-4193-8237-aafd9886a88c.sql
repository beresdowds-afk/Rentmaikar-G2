INSERT INTO public.platform_kv_settings (key, value)
VALUES ('master_communications_endpoint', '{"voice":"+2349163072576","sms":"+2349163072576","whatsapp":"+2349163072576"}'::jsonb)
ON CONFLICT (key) DO NOTHING;