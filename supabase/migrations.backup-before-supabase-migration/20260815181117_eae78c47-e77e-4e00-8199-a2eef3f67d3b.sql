CREATE TABLE IF NOT EXISTS public.provider_api_sessions (
  provider text PRIMARY KEY,
  session_ciphertext text NOT NULL,
  credential_fingerprint text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.provider_api_sessions TO service_role;

ALTER TABLE public.provider_api_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.provider_api_sessions IS 'Encrypted provider API session tokens (e.g. GPSANDTRACK sid) shared across edge function instances. Service role only; no client access.';