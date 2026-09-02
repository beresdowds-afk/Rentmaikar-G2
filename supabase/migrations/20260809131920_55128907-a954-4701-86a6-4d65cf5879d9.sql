INSERT INTO public.platform_kv_settings (key, value)
VALUES ('emqx_management_config', jsonb_build_object(
  'management_host', NULL,
  'management_port', 8443,
  'api_base_path', '/api/v5',
  'api_url', NULL,
  'mqtt_host', NULL,
  'mqtt_port', 8883,
  'management_enabled', true,
  'deployment_type', 'serverless'
))
ON CONFLICT (key) DO UPDATE
SET value = public.platform_kv_settings.value
  || jsonb_build_object('management_port', 8443, 'api_base_path', '/api/v5');