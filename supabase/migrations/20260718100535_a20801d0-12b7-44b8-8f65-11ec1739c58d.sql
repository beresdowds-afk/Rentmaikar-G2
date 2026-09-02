-- Per-call transcript segments
CREATE TABLE IF NOT EXISTS public.voip_call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.voip_calls(id) ON DELETE CASCADE,
  segment_index integer NOT NULL DEFAULT 0,
  speaker text,
  transcript_text text NOT NULL,
  language_code text,
  words jsonb,
  source text NOT NULL DEFAULT 'elevenlabs_scribe_v2',
  audio_storage_path text,
  audio_bytes integer,
  duration_ms integer,
  segment_started_at timestamptz,
  segment_ended_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voip_call_transcripts_call ON public.voip_call_transcripts(call_id, segment_index);

GRANT SELECT ON public.voip_call_transcripts TO authenticated;
GRANT ALL ON public.voip_call_transcripts TO service_role;

ALTER TABLE public.voip_call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all call transcripts"
  ON public.voip_call_transcripts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Participants can view their own call transcripts"
  ON public.voip_call_transcripts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.voip_calls c
      WHERE c.id = voip_call_transcripts.call_id
        AND (c.initiated_by = auth.uid() OR c.receiver_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.voip_call_participants p
      WHERE p.call_id = voip_call_transcripts.call_id
        AND p.user_id = auth.uid()
    )
  );

-- Access to the private voip-call-recordings bucket
CREATE POLICY "Admins can read voip call recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'voip-call-recordings' AND public.has_role(auth.uid(), 'admin'));
