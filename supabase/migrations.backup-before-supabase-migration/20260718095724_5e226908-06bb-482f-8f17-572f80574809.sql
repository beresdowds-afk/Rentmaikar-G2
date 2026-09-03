
-- ElevenLabs test run logs (TTS + STT) for admin troubleshooting
CREATE TABLE public.elevenlabs_test_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tts','stt')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error')),
  region TEXT,
  voice_id TEXT,
  model_id TEXT,
  input_text TEXT,
  input_file_name TEXT,
  input_file_size_bytes INTEGER,
  input_mime_type TEXT,
  transcript_text TEXT,
  language_code TEXT,
  words JSONB,
  audio_storage_path TEXT,
  audio_bytes INTEGER,
  duration_ms INTEGER,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.elevenlabs_test_logs TO authenticated;
GRANT ALL ON public.elevenlabs_test_logs TO service_role;

ALTER TABLE public.elevenlabs_test_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all elevenlabs test logs"
  ON public.elevenlabs_test_logs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users read their own elevenlabs test logs"
  ON public.elevenlabs_test_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_elevenlabs_test_logs_created_at ON public.elevenlabs_test_logs (created_at DESC);
CREATE INDEX idx_elevenlabs_test_logs_kind ON public.elevenlabs_test_logs (kind, created_at DESC);
CREATE INDEX idx_elevenlabs_test_logs_user ON public.elevenlabs_test_logs (user_id, created_at DESC);

-- Storage policies for the private elevenlabs-test-audio bucket
CREATE POLICY "Admins read elevenlabs test audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'elevenlabs-test-audio' AND public.is_admin());

CREATE POLICY "Service role manages elevenlabs test audio"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'elevenlabs-test-audio')
  WITH CHECK (bucket_id = 'elevenlabs-test-audio');
