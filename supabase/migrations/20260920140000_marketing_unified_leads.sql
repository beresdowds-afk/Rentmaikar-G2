-- Migration: 20260920140000_marketing_unified_leads.sql
-- Unified Marketing Leads, Communications & Lifecycle Progression
-- Connects advertising and conversational leads directly to RentMaikar user records and vehicles without duplicate user creation.

-- 1. Marketing Leads Table
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Linked to existing RentMaikar user if registered
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT NOT NULL DEFAULT 'NG',
  city TEXT,
  target_role TEXT NOT NULL DEFAULT 'driver' CHECK (target_role IN ('driver', 'owner', 'renter', 'corporate')),
  stage TEXT NOT NULL DEFAULT 'NEW' CHECK (stage IN (
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'REGISTERED',
    'VERIFIED',
    'KYC_COMPLETED',
    'VEHICLE_LISTED',
    'VEHICLE_APPROVED',
    'RENTAL',
    'CONVERTED'
  )),
  acquisition_source TEXT NOT NULL DEFAULT 'meta' CHECK (acquisition_source IN (
    'meta',
    'google',
    'tiktok',
    'linkedin',
    'manychat',
    'sentdm',
    'twilio',
    'resend',
    'organic',
    'referral',
    'direct'
  )),
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE SET NULL,
  campaign_name TEXT,
  ad_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  first_touch_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_touch_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_touch_channel TEXT NOT NULL DEFAULT 'ad',
  last_touch_channel TEXT NOT NULL DEFAULT 'ad',
  touchpoints_count INTEGER NOT NULL DEFAULT 1,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
  notes TEXT,
  tags TEXT[] DEFAULT '{}'::text[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_email ON public.marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_phone ON public.marketing_leads(phone);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_user_id ON public.marketing_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_stage ON public.marketing_leads(stage);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_source ON public.marketing_leads(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_campaign ON public.marketing_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at ON public.marketing_leads(created_at DESC);

-- 2. Marketing Lead Activity Log (Communications, Status Changes, Touches)
CREATE TABLE IF NOT EXISTS public.marketing_lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'stage_change',
    'sms',
    'whatsapp',
    'email',
    'call',
    'note',
    'ad_click',
    'form_submit',
    'web_visit',
    'registration',
    'verification',
    'kyc',
    'vehicle',
    'rental'
  )),
  channel TEXT,
  provider TEXT CHECK (provider IN ('manychat', 'sentdm', 'twilio', 'resend', 'meta', 'google', 'tiktok', 'linkedin', 'internal')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound', 'system')),
  summary TEXT NOT NULL,
  content TEXT,
  external_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.marketing_lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON public.marketing_lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON public.marketing_lead_activities(created_at DESC);

-- 3. Row Level Security Policies
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view and manage marketing leads"
ON public.marketing_leads FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE POLICY "Admins can view and manage lead activities"
ON public.marketing_lead_activities FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));
