INSERT INTO public.platform_kv_settings (key, value)
VALUES ('emqx_management_config', jsonb_build_object(
  'management_host', 'wd671f6f.ala.us-east-1.emqxsl.com',
  'management_port', 8443,
  'api_base_path', '/api/v5',
  'api_url', 'https://wd671f6f.ala.us-east-1.emqxsl.com:8443/api/v5',
  'mqtt_host', 'wd671f6f.ala.us-east-1.emqxsl.com',
  'mqtt_port', 8883,
  'ws_port', 8084,
  'management_enabled', true,
  'deployment_type', 'serverless'
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;