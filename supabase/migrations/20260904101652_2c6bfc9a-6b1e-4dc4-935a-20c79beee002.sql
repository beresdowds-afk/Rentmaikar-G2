ALTER TABLE public.voip_calls ADD COLUMN IF NOT EXISTS answered_by uuid;

CREATE INDEX IF NOT EXISTS idx_voip_calls_answered_by ON public.voip_calls(answered_by);
CREATE INDEX IF NOT EXISTS idx_voip_calls_created_at ON public.voip_calls(created_at DESC);

CREATE OR REPLACE FUNCTION public.mark_voip_call_answered(_call_sid text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR _call_sid IS NULL OR length(trim(_call_sid)) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.voip_calls
     SET answered_by = auth.uid(),
         status = CASE WHEN status IN ('pending','ringing') THEN 'in-progress' ELSE status END,
         updated_at = now()
   WHERE call_sid = _call_sid
     AND answered_by IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_voip_call_answered(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_voip_call_answered(text) TO authenticated;