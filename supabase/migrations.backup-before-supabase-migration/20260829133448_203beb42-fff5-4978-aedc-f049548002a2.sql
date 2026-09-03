INSERT INTO public.platform_kv_settings (key, value)
VALUES ('comms_loop_policy', '{"enabled": true, "max_hops": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;