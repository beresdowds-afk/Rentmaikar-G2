-- Migration: 20260920130000_marketing_providers_and_spend.sql
-- Phase 3: Marketing Providers, Credentials, Ad Sets, Ads, Daily Spend, and Sync Logs

-- 1. Server-side credentials store for advertising providers
-- Kept strictly server-side with RLS preventing any non-admin access
CREATE TABLE IF NOT EXISTS public.marketing_provider_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  access_token TEXT, -- Server-side only
  refresh_token TEXT, -- Server-side only
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'expired')),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_mkt_provider_platform_acc UNIQUE (platform, account_id)
);

-- 2. Marketing Ad Sets / Ad Groups
CREATE TABLE IF NOT EXISTS public.marketing_ad_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  external_ad_set_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'archived', 'draft')),
  daily_budget NUMERIC DEFAULT 0,
  lifetime_budget NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  targeting JSONB DEFAULT '{}'::jsonb,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Marketing Ads
CREATE TABLE IF NOT EXISTS public.marketing_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_set_id UUID REFERENCES public.marketing_ad_sets(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  external_ad_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'archived', 'draft')),
  creative_id UUID,
  headline TEXT,
  body_text TEXT,
  destination_url TEXT,
  metrics JSONB DEFAULT '{"impressions":0,"clicks":0,"spend":0,"leads":0,"conversions":0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Marketing Creatives
CREATE TABLE IF NOT EXISTS public.marketing_creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'all')),
  name TEXT NOT NULL,
  creative_type TEXT NOT NULL DEFAULT 'image' CHECK (creative_type IN ('image', 'video', 'carousel', 'text')),
  media_url TEXT,
  thumbnail_url TEXT,
  call_to_action TEXT DEFAULT 'LEARN_MORE',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Normalized Daily Spend & Performance Logs
CREATE TABLE IF NOT EXISTS public.marketing_spend_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  account_id TEXT NOT NULL,
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE SET NULL,
  external_campaign_id TEXT,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  leads INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_mkt_daily_spend UNIQUE (platform, account_id, external_campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mkt_spend_platform_date ON public.marketing_spend_daily(platform, date);
CREATE INDEX IF NOT EXISTS idx_mkt_ads_campaign ON public.marketing_ads(campaign_id);

-- RLS Enforcement
ALTER TABLE public.marketing_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_spend_daily ENABLE ROW LEVEL SECURITY;

-- Security Definers & Role Protection: Credentials access is restricted strictly to Admins
CREATE POLICY "Admins can view credentials"
ON public.marketing_provider_credentials FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update credentials"
ON public.marketing_provider_credentials FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ad sets and Ads viewable by Admins and Admin Assistants
CREATE POLICY "Admins view ad sets"
ON public.marketing_ad_sets FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view ads"
ON public.marketing_ads FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view creatives"
ON public.marketing_creatives FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view daily spend"
ON public.marketing_spend_daily FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
