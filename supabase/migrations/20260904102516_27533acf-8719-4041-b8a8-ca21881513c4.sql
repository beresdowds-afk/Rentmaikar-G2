CREATE OR REPLACE FUNCTION public.clear_voip_call_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can clear the call log';
  END IF;

  UPDATE public.voice_call_requests
  SET call_id = NULL
  WHERE call_id IN (
    SELECT id FROM public.voip_calls
    WHERE status NOT IN ('ringing', 'in-progress', 'pending')
  );

  WITH deleted AS (
    DELETE FROM public.voip_calls
    WHERE status NOT IN ('ringing', 'in-progress', 'pending')
    RETURNING id
  )
  SELECT count(*) INTO removed FROM deleted;

  RETURN removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_voip_call_log() TO authenticated;