
-- Create messaging_events table for granular event tracking across all channels
CREATE TABLE public.messaging_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID,
  channel TEXT NOT NULL, -- sms, whatsapp, email, voip, push
  provider TEXT NOT NULL, -- twilio, termii, resend
  event_type TEXT NOT NULL, -- sent, delivered, read, failed, bounced, clicked, opened, queued, unsubscribed, complained, rejected, deferred, blocked, opted_out, opted_in
  direction TEXT NOT NULL DEFAULT 'outbound', -- inbound, outbound
  recipient TEXT, -- phone or email
  sender TEXT, -- from number or email
  region TEXT DEFAULT 'USA',
  provider_event_id TEXT, -- external event ID from provider
  provider_message_id TEXT, -- SID or message ID from provider
  conversation_id UUID REFERENCES public.inbox_conversations(id),
  user_id UUID,
  template_name TEXT,
  error_code TEXT,
  error_message TEXT,
  raw_payload JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_messaging_events_channel ON public.messaging_events(channel);
CREATE INDEX idx_messaging_events_event_type ON public.messaging_events(event_type);
CREATE INDEX idx_messaging_events_provider ON public.messaging_events(provider);
CREATE INDEX idx_messaging_events_recipient ON public.messaging_events(recipient);
CREATE INDEX idx_messaging_events_message_id ON public.messaging_events(message_id);
CREATE INDEX idx_messaging_events_conversation_id ON public.messaging_events(conversation_id);
CREATE INDEX idx_messaging_events_created_at ON public.messaging_events(created_at DESC);
CREATE INDEX idx_messaging_events_user_id ON public.messaging_events(user_id);
CREATE INDEX idx_messaging_events_direction ON public.messaging_events(direction);
CREATE INDEX idx_messaging_events_region ON public.messaging_events(region);

-- Add composite index for common dashboard queries
CREATE INDEX idx_messaging_events_channel_type_date ON public.messaging_events(channel, event_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.messaging_events ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can view all messaging events"
  ON public.messaging_events FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Service role can insert messaging events"
  ON public.messaging_events FOR INSERT
  WITH CHECK (true);

-- Add missing columns to unified_message_log for event correlation
ALTER TABLE public.unified_message_log
  ADD COLUMN IF NOT EXISTS event_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_event_type TEXT,
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_negotiation BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Enable realtime for messaging events dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_events;
