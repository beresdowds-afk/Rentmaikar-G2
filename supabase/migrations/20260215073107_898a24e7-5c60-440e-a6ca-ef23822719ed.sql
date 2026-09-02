
-- Add new social messaging channels to the communication_providers table
INSERT INTO public.communication_providers (region_code, region_name, country_code_prefix, sms_provider, voice_provider, is_active)
SELECT 'social', 'Social Platforms', '+0', 'none', 'none', false
WHERE NOT EXISTS (SELECT 1 FROM public.communication_providers WHERE region_code = 'social');

-- Create a table to store social platform integration configs
CREATE TABLE IF NOT EXISTS public.social_messaging_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  page_id TEXT,
  app_id TEXT,
  api_status TEXT NOT NULL DEFAULT 'not_configured',
  last_connected_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform)
);

ALTER TABLE public.social_messaging_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage social messaging configs"
  ON public.social_messaging_configs FOR ALL
  USING (public.is_admin());

-- Seed the 5 new platforms
INSERT INTO public.social_messaging_configs (platform, display_name) VALUES
  ('facebook_messenger', 'Facebook Messenger'),
  ('instagram', 'Instagram Messenger'),
  ('linkedin', 'LinkedIn Messenger'),
  ('google_chat', 'Google Chat'),
  ('tiktok', 'TikTok Messages')
ON CONFLICT (platform) DO NOTHING;

-- Add trigger for updated_at
CREATE TRIGGER update_social_messaging_configs_updated_at
  BEFORE UPDATE ON public.social_messaging_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
