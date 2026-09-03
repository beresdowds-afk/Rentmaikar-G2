-- Add new support task types to the enum
ALTER TYPE support_task_type ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE support_task_type ADD VALUE IF NOT EXISTS 'payment_accounts';

-- Create social media campaigns table
CREATE TABLE public.social_media_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'google')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('awareness', 'engagement', 'conversion', 'traffic', 'app_install')),
  target_audience JSONB DEFAULT '{}'::jsonb,
  budget NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE,
  end_date DATE,
  region TEXT NOT NULL DEFAULT 'all' CHECK (region IN ('usa', 'nigeria', 'all')),
  content_text TEXT,
  media_urls TEXT[] DEFAULT '{}'::text[],
  external_campaign_id TEXT,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_media_campaigns ENABLE ROW LEVEL SECURITY;

-- Only admins can manage campaigns
CREATE POLICY "Admins can manage all campaigns"
ON public.social_media_campaigns
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Create indexes
CREATE INDEX idx_social_media_campaigns_platform ON public.social_media_campaigns(platform);
CREATE INDEX idx_social_media_campaigns_status ON public.social_media_campaigns(status);
CREATE INDEX idx_social_media_campaigns_region ON public.social_media_campaigns(region);

-- Create social media posts table for scheduled posts
CREATE TABLE public.social_media_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'google')),
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}'::text[],
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  external_post_id TEXT,
  engagement_metrics JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_media_posts ENABLE ROW LEVEL SECURITY;

-- Only admins can manage posts
CREATE POLICY "Admins can manage all posts"
ON public.social_media_posts
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Create indexes
CREATE INDEX idx_social_media_posts_campaign ON public.social_media_posts(campaign_id);
CREATE INDEX idx_social_media_posts_scheduled ON public.social_media_posts(scheduled_at);
CREATE INDEX idx_social_media_posts_status ON public.social_media_posts(status);

-- Add trigger for updated_at
CREATE TRIGGER update_social_media_campaigns_updated_at
BEFORE UPDATE ON public.social_media_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_social_media_posts_updated_at
BEFORE UPDATE ON public.social_media_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();