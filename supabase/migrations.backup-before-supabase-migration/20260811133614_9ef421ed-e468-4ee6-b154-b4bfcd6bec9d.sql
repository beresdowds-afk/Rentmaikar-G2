CREATE TABLE IF NOT EXISTS public.inbox_attachment_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid,
  conversation_id uuid,
  attachment_key text NOT NULL,
  filename text NOT NULL DEFAULT 'attachment',
  content_type text,
  action text NOT NULL DEFAULT 'view',
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_email text,
  succeeded boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_attachment_access_action_chk CHECK (action IN ('view','preview','download','open_external','ocr'))
);

GRANT SELECT, INSERT ON public.inbox_attachment_access_log TO authenticated;
GRANT ALL ON public.inbox_attachment_access_log TO service_role;

ALTER TABLE public.inbox_attachment_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read attachment access log" ON public.inbox_attachment_access_log;
CREATE POLICY "Staff read attachment access log"
ON public.inbox_attachment_access_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
);

DROP POLICY IF EXISTS "Staff record own attachment access" ON public.inbox_attachment_access_log;
CREATE POLICY "Staff record own attachment access"
ON public.inbox_attachment_access_log
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
  )
);

CREATE INDEX IF NOT EXISTS idx_inbox_att_access_created ON public.inbox_attachment_access_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_att_access_user ON public.inbox_attachment_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_att_access_conversation ON public.inbox_attachment_access_log(conversation_id);