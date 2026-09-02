
-- Email campaigns table
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template TEXT,
  category TEXT,
  target_audience JSONB DEFAULT '{}',
  scheduled_date TIMESTAMPTZ,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email campaigns" ON public.email_campaigns FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert email campaigns" ON public.email_campaigns FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update email campaigns" ON public.email_campaigns FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete email campaigns" ON public.email_campaigns FOR DELETE USING (public.is_admin());

CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email templates storage table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT,
  subject TEXT NOT NULL,
  html_content TEXT,
  text_content TEXT,
  variables JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email templates" ON public.email_templates FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can insert email templates" ON public.email_templates FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update email templates" ON public.email_templates FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can delete email templates" ON public.email_templates FOR DELETE USING (public.is_admin());

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
