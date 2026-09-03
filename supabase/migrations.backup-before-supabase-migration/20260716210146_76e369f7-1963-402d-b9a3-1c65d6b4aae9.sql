
-- iot_sync_state: per-provider ingestion monitor
CREATE TABLE IF NOT EXISTS public.iot_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  devices_synced INTEGER NOT NULL DEFAULT 0,
  positions_imported INTEGER NOT NULL DEFAULT 0,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iot_sync_state TO authenticated;
GRANT ALL ON public.iot_sync_state TO service_role;

ALTER TABLE public.iot_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view iot sync state"
  ON public.iot_sync_state FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TRIGGER trg_iot_sync_state_updated
  BEFORE UPDATE ON public.iot_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
