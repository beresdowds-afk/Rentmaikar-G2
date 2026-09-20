-- Migration: 20260920120000_marketing_engine_core.sql
-- Core Marketing Engine Schema, Event Tracking, Touchpoints & Attribution Model
-- Extends RentMaikar database without modifying Traccar/IoT or duplicating existing tables.

-- 1. Marketing Platform Accounts (Stores metadata for ad/messaging provider connections)
CREATE TABLE IF NOT EXISTS public.marketing_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'manychat', 'sentdm', 'twilio', 'resend')),
  account_id TEXT NOT NULL,
  account_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled', 'disconnected')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_marketing_account UNIQUE (platform, account_id)
);

-- 2. Marketing UTM Sessions & Visitor Touchpoints (Tracks web & app anonymous to authenticated visitor journeys)
CREATE TABLE IF NOT EXISTS public.marketing_utm_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL, -- Anonymous client session identifier (cookie/local token)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Nullable until visitor signs in or creates account
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referrer TEXT,
  landing_page TEXT,
  ip_region TEXT,
  user_agent TEXT,
  fbp TEXT, -- Meta browser ID
  fbc TEXT, -- Meta click ID
  gclid TEXT, -- Google click ID
  ttclid TEXT, -- TikTok click ID
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_utm_sessions_session_id ON public.marketing_utm_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_marketing_utm_sessions_user_id ON public.marketing_utm_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_utm_sessions_campaign ON public.marketing_utm_sessions(utm_campaign);

-- 3. Canonical Marketing Events
CREATE TABLE IF NOT EXISTS public.marketing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'PAGE_VIEW',
    'LANDING_PAGE_VIEW',
    'AD_CLICK',
    'LEAD_CREATED',
    'ACCOUNT_CREATED',
    'ROLE_SELECTED',
    'PHONE_VERIFIED',
    'KYC_STARTED',
    'KYC_COMPLETED',
    'OWNER_APPROVED',
    'DRIVER_APPROVED',
    'VEHICLE_CREATED',
    'VEHICLE_LISTED',
    'VEHICLE_APPROVED',
    'RENTAL_REQUESTED',
    'RENTAL_COMPLETED',
    'PAYMENT_STARTED',
    'PAYMENT_COMPLETED',
    'COMMUNICATION_STARTED',
    'WHATSAPP_CONVERSATION',
    'SMS_SENT',
    'EMAIL_SENT',
    'CALL_STARTED',
    'CALL_COMPLETED'
  )),
  event_id TEXT NOT NULL UNIQUE, -- Idempotency key (e.g. meta event ID or client UUID)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  campaign_id UUID REFERENCES public.social_media_campaigns(id) ON DELETE SET NULL, -- References existing campaigns table
  properties JSONB DEFAULT '{}'::jsonb,
  user_data JSONB DEFAULT '{}'::jsonb, -- Masked/hashed client telemetry
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_events_name ON public.marketing_events(event_name);
CREATE INDEX IF NOT EXISTS idx_marketing_events_user_id ON public.marketing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_session_id ON public.marketing_events(session_id);
CREATE INDEX IF NOT EXISTS idx_marketing_events_created_at ON public.marketing_events(created_at DESC);

-- 4. Multi-Touch Attribution Engine (First-Touch, Last-Touch, Linear)
CREATE TABLE IF NOT EXISTS public.marketing_attribution (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id TEXT, -- Associated lead or applicant identifier
  conversion_event_id UUID REFERENCES public.marketing_events(id) ON DELETE CASCADE,
  first_touch_session_id UUID REFERENCES public.marketing_utm_sessions(id) ON DELETE SET NULL,
  last_touch_session_id UUID REFERENCES public.marketing_utm_sessions(id) ON DELETE SET NULL,
  first_touch_campaign TEXT,
  first_touch_source TEXT,
  first_touch_medium TEXT,
  last_touch_campaign TEXT,
  last_touch_source TEXT,
  last_touch_medium TEXT,
  conversion_type TEXT NOT NULL,
  conversion_value NUMERIC DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_attribution_user_id ON public.marketing_attribution(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_attribution_lead ON public.marketing_attribution(lead_id);

-- 5. Marketing Webhook Audit & Ingestion
CREATE TABLE IF NOT EXISTS public.marketing_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'manychat', 'sentdm', 'twilio', 'resend')),
  event_type TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  headers JSONB DEFAULT '{}'::jsonb,
  payload JSONB DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed', 'ignored')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_webhooks_platform ON public.marketing_webhooks(platform);
CREATE INDEX IF NOT EXISTS idx_marketing_webhooks_status ON public.marketing_webhooks(processing_status);

-- 6. Marketing Sync Jobs & Health
CREATE TABLE IF NOT EXISTS public.marketing_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.marketing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_utm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policies for Admins and Admin Assistants
CREATE POLICY "Admins can view and manage marketing accounts"
ON public.marketing_accounts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Visitors & Users can insert their own UTM sessions and events
CREATE POLICY "Allow public creation of UTM sessions"
ON public.marketing_utm_sessions FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can view own UTM sessions"
ON public.marketing_utm_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE POLICY "Allow creation of marketing events"
ON public.marketing_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view marketing events"
ON public.marketing_events FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE POLICY "Admins can view attribution records"
ON public.marketing_attribution FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view webhooks and sync jobs"
ON public.marketing_webhooks FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE POLICY "Admins can manage sync jobs"
ON public.marketing_sync_jobs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
