CREATE TABLE public.inbox_reply_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  channel text NOT NULL,
  reply_type text NOT NULL DEFAULT 'auto',
  rule_id uuid,
  rule_name text,
  matched_keywords text[] NOT NULL DEFAULT '{}',
  match_type text,
  cooldown_minutes integer,
  cooldown_status text NOT NULL DEFAULT 'not_applicable',
  cooldown_remaining_minutes numeric,
  canned_reply_id uuid,
  canned_reply_title text,
  body_preview text,
  delivered boolean NOT NULL DEFAULT false,
  error_message text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_reply_audit_conversation ON public.inbox_reply_audit (conversation_id, created_at DESC);

GRANT SELECT, INSERT ON public.inbox_reply_audit TO authenticated;
GRANT ALL ON public.inbox_reply_audit TO service_role;

ALTER TABLE public.inbox_reply_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view reply audit"
ON public.inbox_reply_audit
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'admin_assistant'::app_role));

CREATE POLICY "Admins insert reply audit"
ON public.inbox_reply_audit
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'admin_assistant'::app_role))
  AND actor_id = auth.uid()
);