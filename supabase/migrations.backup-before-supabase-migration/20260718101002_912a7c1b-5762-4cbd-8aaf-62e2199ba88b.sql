
-- Retention settings (single row)
CREATE TABLE IF NOT EXISTS public.elevenlabs_retention_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_retention_days integer NOT NULL DEFAULT 30 CHECK (audio_retention_days > 0),
  transcript_retention_days integer NOT NULL DEFAULT 90 CHECK (transcript_retention_days > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.elevenlabs_retention_settings TO authenticated;
GRANT ALL ON public.elevenlabs_retention_settings TO service_role;

ALTER TABLE public.elevenlabs_retention_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read retention settings"
  ON public.elevenlabs_retention_settings FOR SELECT
  TO authenticated
  USING (public.is_admin());

INSERT INTO public.elevenlabs_retention_settings (audio_retention_days, transcript_retention_days)
SELECT 30, 90
WHERE NOT EXISTS (SELECT 1 FROM public.elevenlabs_retention_settings);

-- Admin RPC to update retention
CREATE OR REPLACE FUNCTION public.admin_update_elevenlabs_retention(
  _audio_days integer,
  _transcript_days integer
)
RETURNS public.elevenlabs_retention_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.elevenlabs_retention_settings;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can update retention settings';
  END IF;
  IF _audio_days <= 0 OR _transcript_days <= 0 THEN
    RAISE EXCEPTION 'Retention days must be positive';
  END IF;
  UPDATE public.elevenlabs_retention_settings
     SET audio_retention_days = _audio_days,
         transcript_retention_days = _transcript_days,
         updated_by = auth.uid(),
         updated_at = now()
   RETURNING * INTO row;
  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_elevenlabs_retention(integer, integer) TO authenticated;

-- Admin delete single log (row + audio)
CREATE OR REPLACE FUNCTION public.admin_delete_elevenlabs_test_log(_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _path text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete test logs';
  END IF;
  SELECT audio_storage_path INTO _path FROM public.elevenlabs_test_logs WHERE id = _log_id;
  IF _path IS NOT NULL THEN
    DELETE FROM storage.objects WHERE bucket_id = 'elevenlabs-test-audio' AND name = _path;
  END IF;
  DELETE FROM public.elevenlabs_test_logs WHERE id = _log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_elevenlabs_test_log(uuid) TO authenticated;

-- Automatic retention purge (called by cron)
CREATE OR REPLACE FUNCTION public.purge_expired_elevenlabs_test_logs()
RETURNS TABLE (audio_deleted integer, logs_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _audio_days integer;
  _tx_days integer;
  _audio_deleted integer := 0;
  _logs_deleted integer := 0;
BEGIN
  SELECT audio_retention_days, transcript_retention_days
    INTO _audio_days, _tx_days
    FROM public.elevenlabs_retention_settings
    ORDER BY updated_at DESC
    LIMIT 1;
  _audio_days := COALESCE(_audio_days, 30);
  _tx_days := COALESCE(_tx_days, 90);

  -- Purge stored audio past its retention window (keep transcript rows)
  WITH expired AS (
    SELECT id, audio_storage_path
      FROM public.elevenlabs_test_logs
     WHERE audio_storage_path IS NOT NULL
       AND created_at < now() - make_interval(days => _audio_days)
  ),
  del_obj AS (
    DELETE FROM storage.objects o
     USING expired e
     WHERE o.bucket_id = 'elevenlabs-test-audio'
       AND o.name = e.audio_storage_path
    RETURNING 1
  )
  SELECT count(*) INTO _audio_deleted FROM del_obj;

  UPDATE public.elevenlabs_test_logs
     SET audio_storage_path = NULL,
         audio_bytes = NULL,
         response_metadata = COALESCE(response_metadata, '{}'::jsonb) || jsonb_build_object('audio_purged_at', now())
   WHERE audio_storage_path IS NOT NULL
     AND created_at < now() - make_interval(days => _audio_days);

  -- Purge full log rows past transcript retention
  WITH removed AS (
    DELETE FROM public.elevenlabs_test_logs
     WHERE created_at < now() - make_interval(days => _tx_days)
    RETURNING 1
  )
  SELECT count(*) INTO _logs_deleted FROM removed;

  RETURN QUERY SELECT _audio_deleted, _logs_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_elevenlabs_test_logs() TO service_role;

-- Save Voice Agent transcript
CREATE OR REPLACE FUNCTION public.save_voice_agent_transcript(
  _region text,
  _agent_id text,
  _transcript_text text,
  _turns jsonb,
  _duration_ms integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _transcript_text IS NULL OR length(trim(_transcript_text)) = 0 THEN
    RAISE EXCEPTION 'Transcript is empty';
  END IF;

  INSERT INTO public.elevenlabs_test_logs (
    user_id, kind, status, region, model_id, transcript_text, duration_ms,
    request_metadata, response_metadata
  ) VALUES (
    auth.uid(), 'stt', 'success', _region, 'convai_voice_agent',
    _transcript_text, _duration_ms,
    jsonb_build_object('source', 'voice_agent', 'agent_id', _agent_id, 'turns', COALESCE(_turns, '[]'::jsonb)),
    jsonb_build_object('captured_at', now())
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_voice_agent_transcript(text, text, text, jsonb, integer) TO authenticated;
