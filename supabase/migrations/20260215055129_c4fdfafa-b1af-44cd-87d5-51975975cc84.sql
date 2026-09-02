
-- Email logs for tracking all outbound emails
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority TEXT NOT NULL DEFAULT 'normal',
  country TEXT,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email analytics for daily aggregations
CREATE TABLE public.email_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, category, status)
);

-- Enable RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_analytics ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view email logs"
  ON public.email_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can view email analytics"
  ON public.email_analytics FOR SELECT
  USING (public.is_admin());

-- Service role insert (edge functions use service key)
CREATE POLICY "Service can insert email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update email logs"
  ON public.email_logs FOR UPDATE
  USING (true);

CREATE POLICY "Service can insert email analytics"
  ON public.email_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update email analytics"
  ON public.email_analytics FOR UPDATE
  USING (true);

-- Indexes
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX idx_email_logs_created ON public.email_logs(created_at DESC);
CREATE INDEX idx_email_logs_template ON public.email_logs(template);
CREATE INDEX idx_email_analytics_date ON public.email_analytics(date DESC);

-- Triggers for updated_at
CREATE TRIGGER update_email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_analytics_updated_at
  BEFORE UPDATE ON public.email_analytics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
