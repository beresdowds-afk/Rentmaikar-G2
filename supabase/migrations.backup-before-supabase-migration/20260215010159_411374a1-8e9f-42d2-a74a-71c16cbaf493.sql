
-- Create voicemail_logs table for tracking voicemail drops and follow-ups
CREATE TABLE public.voicemail_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  call_sid TEXT,
  script_type TEXT NOT NULL,
  personalized_message TEXT,
  callback_queue TEXT,
  sms_followup_sent BOOLEAN DEFAULT false,
  sms_link_sent BOOLEAN DEFAULT false,
  voicemail_detected BOOLEAN DEFAULT false,
  region TEXT DEFAULT 'US',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voicemail_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage voicemail logs"
  ON public.voicemail_logs
  FOR ALL
  USING (public.is_admin());

-- Index for lookups
CREATE INDEX idx_voicemail_logs_user_id ON public.voicemail_logs(user_id);
CREATE INDEX idx_voicemail_logs_script_type ON public.voicemail_logs(script_type);
CREATE INDEX idx_voicemail_logs_created_at ON public.voicemail_logs(created_at DESC);

-- Timestamp trigger
CREATE TRIGGER update_voicemail_logs_updated_at
  BEFORE UPDATE ON public.voicemail_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
