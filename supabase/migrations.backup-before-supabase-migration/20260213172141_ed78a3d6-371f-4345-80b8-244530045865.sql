
-- Communication Providers Registry (region-aware routing)
CREATE TABLE public.communication_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region_code TEXT NOT NULL,
  region_name TEXT NOT NULL,
  country_code_prefix TEXT NOT NULL,
  sms_provider TEXT NOT NULL DEFAULT 'twilio',
  voice_provider TEXT NOT NULL DEFAULT 'twilio',
  forwarding_number TEXT,
  sender_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  retry_count INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(region_code)
);

ALTER TABLE public.communication_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage communication providers"
  ON public.communication_providers FOR ALL USING (is_admin());

CREATE POLICY "Anyone can view active providers"
  ON public.communication_providers FOR SELECT USING (is_active = true);

-- Seed default providers
INSERT INTO public.communication_providers (region_code, region_name, country_code_prefix, sms_provider, voice_provider, sender_id)
VALUES 
  ('US', 'United States', '+1', 'twilio', 'twilio', 'Rentmaikar'),
  ('NG', 'Nigeria', '+234', 'termii', 'termii', 'Rentmaikar');

-- Unified Message Log
CREATE TABLE public.unified_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_phone TEXT,
  user_name TEXT,
  region TEXT NOT NULL,
  provider TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'forwarded')),
  message_type TEXT NOT NULL DEFAULT 'general',
  message_body TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  forwarded_to TEXT,
  forwarded_at TIMESTAMP WITH TIME ZONE,
  forwarded_message_id TEXT,
  conversation_id UUID REFERENCES public.inbox_conversations(id),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.unified_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all message logs"
  ON public.unified_message_log FOR ALL USING (is_admin());

CREATE POLICY "System can insert message logs"
  ON public.unified_message_log FOR INSERT WITH CHECK (true);

-- Enable realtime for unified message log
ALTER PUBLICATION supabase_realtime ADD TABLE public.unified_message_log;

-- Triggers for updated_at
CREATE TRIGGER update_communication_providers_updated_at
  BEFORE UPDATE ON public.communication_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_unified_message_log_updated_at
  BEFORE UPDATE ON public.unified_message_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_unified_message_log_user ON public.unified_message_log(user_phone);
CREATE INDEX idx_unified_message_log_region ON public.unified_message_log(region);
CREATE INDEX idx_unified_message_log_direction ON public.unified_message_log(direction);
CREATE INDEX idx_unified_message_log_conversation ON public.unified_message_log(conversation_id);
CREATE INDEX idx_communication_providers_region ON public.communication_providers(region_code);
