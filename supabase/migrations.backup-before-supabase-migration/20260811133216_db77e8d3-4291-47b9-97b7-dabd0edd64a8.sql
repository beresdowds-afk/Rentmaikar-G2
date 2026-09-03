CREATE TABLE IF NOT EXISTS public.inbox_attachment_ocr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  conversation_id uuid,
  attachment_key text NOT NULL,
  filename text NOT NULL DEFAULT 'attachment',
  content_type text,
  extracted_text text,
  char_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error text,
  processed_at timestamptz,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_attachment_ocr_status_chk CHECK (status IN ('pending','processing','completed','failed')),
  CONSTRAINT inbox_attachment_ocr_unique UNIQUE (message_id, attachment_key)
);

GRANT SELECT ON public.inbox_attachment_ocr TO authenticated;
GRANT ALL ON public.inbox_attachment_ocr TO service_role;

ALTER TABLE public.inbox_attachment_ocr ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and assistants read attachment OCR" ON public.inbox_attachment_ocr;
CREATE POLICY "Admins and assistants read attachment OCR"
ON public.inbox_attachment_ocr
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'admin_assistant'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_inbox_attachment_ocr_message ON public.inbox_attachment_ocr(message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_attachment_ocr_conversation ON public.inbox_attachment_ocr(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_attachment_ocr_text ON public.inbox_attachment_ocr USING gin (to_tsvector('simple', coalesce(extracted_text, '')));

CREATE OR REPLACE FUNCTION public.touch_inbox_attachment_ocr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_inbox_attachment_ocr() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_inbox_attachment_ocr() FROM anon;
REVOKE ALL ON FUNCTION public.touch_inbox_attachment_ocr() FROM authenticated;

DROP TRIGGER IF EXISTS trg_touch_inbox_attachment_ocr ON public.inbox_attachment_ocr;
CREATE TRIGGER trg_touch_inbox_attachment_ocr
BEFORE UPDATE ON public.inbox_attachment_ocr
FOR EACH ROW EXECUTE FUNCTION public.touch_inbox_attachment_ocr();