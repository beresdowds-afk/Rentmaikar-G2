UPDATE public.telemetry_providers SET is_active = true, priority = 1 WHERE name = 'traccar';
UPDATE public.telemetry_providers SET is_active = true, priority = 2 WHERE name = 'emqx';