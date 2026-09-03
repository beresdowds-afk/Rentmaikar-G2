
-- Email open tracking
CREATE TABLE public.email_opens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email click tracking
CREATE TABLE public.email_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  link TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_conversion BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email bounce tracking
CREATE TABLE public.email_bounces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  bounce_type TEXT NOT NULL,
  bounced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email complaint tracking
CREATE TABLE public.email_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  complained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  complaint_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email suppression list
CREATE TABLE public.email_suppression_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  source_message_id TEXT,
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_bounces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

-- Admin read policies
CREATE POLICY "Admins can view email opens" ON public.email_opens FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can view email clicks" ON public.email_clicks FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can view email bounces" ON public.email_bounces FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can view email complaints" ON public.email_complaints FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can view suppression list" ON public.email_suppression_list FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage suppression list" ON public.email_suppression_list FOR UPDATE USING (public.is_admin());

-- Service insert policies (edge functions via service key)
CREATE POLICY "Service can insert email opens" ON public.email_opens FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert email clicks" ON public.email_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert email bounces" ON public.email_bounces FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert email complaints" ON public.email_complaints FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert suppression" ON public.email_suppression_list FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update suppression" ON public.email_suppression_list FOR UPDATE USING (true);

-- Indexes
CREATE INDEX idx_email_opens_message ON public.email_opens(message_id);
CREATE INDEX idx_email_opens_recipient ON public.email_opens(recipient);
CREATE INDEX idx_email_clicks_message ON public.email_clicks(message_id);
CREATE INDEX idx_email_clicks_recipient ON public.email_clicks(recipient);
CREATE INDEX idx_email_bounces_message ON public.email_bounces(message_id);
CREATE INDEX idx_email_bounces_recipient ON public.email_bounces(recipient);
CREATE INDEX idx_email_complaints_message ON public.email_complaints(message_id);
CREATE INDEX idx_email_suppression_email ON public.email_suppression_list(email);

-- Trigger for suppression list updated_at
CREATE TRIGGER update_email_suppression_updated_at
  BEFORE UPDATE ON public.email_suppression_list
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
