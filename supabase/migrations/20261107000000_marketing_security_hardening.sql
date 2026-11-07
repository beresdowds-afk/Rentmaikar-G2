-- Additive, backwards-compatible persistence for Marketing Engine security state.
-- Existing webhook rows and OAuth credentials are retained.

ALTER TABLE public.marketing_webhooks
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS payload_sha256 TEXT;

-- Preserve existing audit rows. Backfill only one legacy row per provider/event pair;
-- duplicate legacy rows remain untouched and without the new identity value.
WITH legacy_event_ids AS (
  SELECT id,
         platform,
         headers->>'x-event-id' AS event_id,
         row_number() OVER (
           PARTITION BY platform, headers->>'x-event-id'
           ORDER BY created_at, id
         ) AS row_number
  FROM public.marketing_webhooks
  WHERE headers->>'x-event-id' IS NOT NULL
)
UPDATE public.marketing_webhooks AS webhook
SET provider_event_id = legacy_event_ids.event_id
FROM legacy_event_ids
WHERE webhook.id = legacy_event_ids.id
  AND legacy_event_ids.row_number = 1
  AND webhook.provider_event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_webhooks_provider_event
  ON public.marketing_webhooks(platform, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- OAuth state is stored as a hash only. Conditional UPDATE consumption provides
-- single-use semantics across requests, instances, and restarts.
CREATE TABLE IF NOT EXISTS public.marketing_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'linkedin')),
  initiating_user_id TEXT NOT NULL,
  tenant_id TEXT,
  connection_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_oauth_states_expiry
  ON public.marketing_oauth_states(expires_at);

ALTER TABLE public.marketing_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_oauth_states FROM anon, authenticated;
GRANT ALL ON public.marketing_oauth_states TO service_role;
