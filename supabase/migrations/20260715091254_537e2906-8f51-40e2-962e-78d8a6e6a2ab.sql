
-- 1) iot_devices installation + health fields
ALTER TABLE public.iot_devices
  ADD COLUMN IF NOT EXISTS installation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS installation_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS installation_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS telemetry_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_details jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'iot_devices_installation_status_check'
  ) THEN
    ALTER TABLE public.iot_devices
      ADD CONSTRAINT iot_devices_installation_status_check
      CHECK (installation_status IN ('pending','confirmed'));
  END IF;
END $$;

-- 2) iot_audit_log
CREATE TABLE IF NOT EXISTS public.iot_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  performed_by uuid,
  device_id uuid REFERENCES public.iot_devices(id) ON DELETE SET NULL,
  sim_id uuid REFERENCES public.iot_sim_cards(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iot_audit_log TO authenticated;
GRANT ALL ON public.iot_audit_log TO service_role;

ALTER TABLE public.iot_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read iot audit" ON public.iot_audit_log;
CREATE POLICY "Admins read iot audit"
  ON public.iot_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service role writes iot audit" ON public.iot_audit_log;
CREATE POLICY "Service role writes iot audit"
  ON public.iot_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_iot_audit_device ON public.iot_audit_log(device_id);
CREATE INDEX IF NOT EXISTS idx_iot_audit_sim    ON public.iot_audit_log(sim_id);
CREATE INDEX IF NOT EXISTS idx_iot_audit_time   ON public.iot_audit_log(created_at DESC);

-- 3) Prevent a user being in more than one account_link (blocks chains + cycles)
CREATE OR REPLACE FUNCTION public.enforce_single_account_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_links
    WHERE id <> COALESCE(NEW.id, gen_random_uuid())
      AND (
        user_a_id = NEW.user_a_id OR user_b_id = NEW.user_a_id OR
        user_a_id = NEW.user_b_id OR user_b_id = NEW.user_b_id
      )
  ) THEN
    RAISE EXCEPTION 'One of these accounts is already linked. Unlink first to prevent circular activation cascades.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_account_link_trg ON public.account_links;
CREATE TRIGGER enforce_single_account_link_trg
  BEFORE INSERT OR UPDATE ON public.account_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_account_link();
