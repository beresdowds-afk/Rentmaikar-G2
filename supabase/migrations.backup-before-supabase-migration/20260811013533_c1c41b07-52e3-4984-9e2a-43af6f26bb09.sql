CREATE TABLE public.inbox_canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  channel text,
  region text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_canned_replies TO authenticated;
GRANT ALL ON public.inbox_canned_replies TO service_role;
ALTER TABLE public.inbox_canned_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage canned replies"
ON public.inbox_canned_replies FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE TABLE public.inbox_auto_reply_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  match_type text NOT NULL DEFAULT 'any',
  canned_reply_id uuid REFERENCES public.inbox_canned_replies(id) ON DELETE SET NULL,
  reply_body text,
  channel text,
  region text,
  priority integer NOT NULL DEFAULT 100,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  trigger_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_auto_reply_rules TO authenticated;
GRANT ALL ON public.inbox_auto_reply_rules TO service_role;
ALTER TABLE public.inbox_auto_reply_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage auto reply rules"
ON public.inbox_auto_reply_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'admin_assistant'));

CREATE INDEX idx_inbox_auto_reply_rules_active ON public.inbox_auto_reply_rules (is_active, priority);
CREATE INDEX idx_inbox_canned_replies_active ON public.inbox_canned_replies (is_active, sort_order);

CREATE TRIGGER update_inbox_canned_replies_updated_at
BEFORE UPDATE ON public.inbox_canned_replies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inbox_auto_reply_rules_updated_at
BEFORE UPDATE ON public.inbox_auto_reply_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();