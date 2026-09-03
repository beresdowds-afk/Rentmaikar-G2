CREATE TABLE IF NOT EXISTS public.twilio_message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'both',
  country_code TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  body TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  twilio_content_sid TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT twilio_message_templates_channel_check CHECK (channel IN ('sms','whatsapp','both'))
);

CREATE UNIQUE INDEX IF NOT EXISTS twilio_message_templates_key_scope_idx
  ON public.twilio_message_templates (template_key, channel, COALESCE(country_code,'*'), language);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.twilio_message_templates TO authenticated;
GRANT ALL ON public.twilio_message_templates TO service_role;

ALTER TABLE public.twilio_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and permitted assistants can view message templates"
  ON public.twilio_message_templates FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_view_communications'));

CREATE POLICY "Admins can insert message templates"
  ON public.twilio_message_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update message templates"
  ON public.twilio_message_templates FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete message templates"
  ON public.twilio_message_templates FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_twilio_message_templates_updated_at
  BEFORE UPDATE ON public.twilio_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();