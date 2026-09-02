
-- =========================================================================
-- Integrations: Traccar shadow log, Hologram SIM inventory, Wachimp provider,
-- per-region WhatsApp routing preference. All admin-only.
-- =========================================================================

-- ---- Telemetry shadow comparison log (Traccar vs EMQX validation) ----
CREATE TABLE IF NOT EXISTS public.telemetry_shadow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID,
  device_id TEXT,
  primary_provider TEXT NOT NULL,
  shadow_provider TEXT NOT NULL,
  primary_online BOOLEAN,
  shadow_online BOOLEAN,
  primary_lat NUMERIC,
  primary_lng NUMERIC,
  shadow_lat NUMERIC,
  shadow_lng NUMERIC,
  divergence_score NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telemetry_shadow_log TO authenticated;
GRANT ALL ON public.telemetry_shadow_log TO service_role;
ALTER TABLE public.telemetry_shadow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view telemetry shadow log"
  ON public.telemetry_shadow_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role manages telemetry shadow log"
  ON public.telemetry_shadow_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_telemetry_shadow_created ON public.telemetry_shadow_log(created_at DESC);

-- ---- IoT SIM cards inventory (Hologram + future providers) ----
CREATE TABLE IF NOT EXISTS public.iot_sim_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iccid TEXT UNIQUE NOT NULL,
  msisdn TEXT,
  imsi TEXT,
  provider TEXT NOT NULL DEFAULT 'hologram',
  provider_sim_id TEXT,
  device_id UUID,
  vehicle_id UUID,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan_name TEXT,
  data_usage_mb NUMERIC DEFAULT 0,
  data_limit_mb NUMERIC,
  last_session_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_sim_cards TO authenticated;
GRANT ALL ON public.iot_sim_cards TO service_role;
ALTER TABLE public.iot_sim_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sim cards"
  ON public.iot_sim_cards FOR ALL
  TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Service role manages sim cards"
  ON public.iot_sim_cards FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_iot_sim_cards_updated_at
  BEFORE UPDATE ON public.iot_sim_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_iot_sim_cards_device ON public.iot_sim_cards(device_id);
CREATE INDEX IF NOT EXISTS idx_iot_sim_cards_vehicle ON public.iot_sim_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_iot_sim_cards_status ON public.iot_sim_cards(status);

-- ---- Per-region preferred WhatsApp provider ----
ALTER TABLE public.communication_providers
  ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT;

-- Backfill: preserve existing behavior (USA -> twilio, NG -> termii)
UPDATE public.communication_providers
   SET whatsapp_provider = CASE
     WHEN country_code_prefix = '+234' THEN 'termii'
     WHEN country_code_prefix = '+1'   THEN 'twilio'
     ELSE 'wachimp'
   END
 WHERE whatsapp_provider IS NULL;
