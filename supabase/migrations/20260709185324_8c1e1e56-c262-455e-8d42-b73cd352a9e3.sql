
-- Driver Call-In System
CREATE TYPE public.call_in_type AS ENUM ('fault', 'maintenance', 'sick');
CREATE TYPE public.call_in_status AS ENUM ('active', 'expired', 'cancelled', 'breached', 'resolved');

-- Add suspension columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payments_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_call_in_id UUID;

-- Extend vehicle_recalls with call-in linkage & approvals
ALTER TABLE public.vehicle_recalls
  ADD COLUMN IF NOT EXISTS triggered_by_call_ins UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS owner_approval_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS owner_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_validation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_validated_by UUID;

-- driver_call_ins
CREATE TABLE public.driver_call_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  rental_id UUID,
  vehicle_id UUID NOT NULL,
  type public.call_in_type NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  telemetry_snapshot JSONB DEFAULT '{}'::jsonb,
  status public.call_in_status NOT NULL DEFAULT 'active',
  geofence_lat DOUBLE PRECISION,
  geofence_lng DOUBLE PRECISION,
  geofence_radius_m INTEGER NOT NULL DEFAULT 20,
  extend_requested BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.driver_call_ins TO authenticated;
GRANT ALL ON public.driver_call_ins TO service_role;

ALTER TABLE public.driver_call_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own call-ins"
  ON public.driver_call_ins FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.is_admin()
    OR public.is_any_support_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = driver_call_ins.vehicle_id AND v.owner_id = auth.uid()
    )
  );

CREATE POLICY "Drivers create own call-ins"
  ON public.driver_call_ins FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers cancel own call-ins; admins update any"
  ON public.driver_call_ins FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin())
  WITH CHECK (driver_id = auth.uid() OR public.is_admin());

CREATE INDEX idx_call_ins_driver_active ON public.driver_call_ins (driver_id, status);
CREATE INDEX idx_call_ins_vehicle_active ON public.driver_call_ins (vehicle_id, status);
CREATE INDEX idx_call_ins_expires ON public.driver_call_ins (expires_at) WHERE status = 'active';

-- vehicle_geofences
CREATE TABLE public.vehicle_geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  call_in_id UUID NOT NULL REFERENCES public.driver_call_ins(id) ON DELETE CASCADE,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 20,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  breached_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_distance_m DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_geofences TO authenticated;
GRANT ALL ON public.vehicle_geofences TO service_role;

ALTER TABLE public.vehicle_geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Related parties view geofences"
  ON public.vehicle_geofences FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_any_support_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.driver_call_ins c
      WHERE c.id = vehicle_geofences.call_in_id AND c.driver_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_geofences.vehicle_id AND v.owner_id = auth.uid()
    )
  );

CREATE INDEX idx_geofence_active ON public.vehicle_geofences (vehicle_id, active);

-- Trigger: set expires_at based on type
CREATE OR REPLACE FUNCTION public.set_call_in_expiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := CASE
      WHEN NEW.type = 'sick' THEN NEW.started_at + INTERVAL '7 days'
      ELSE NEW.started_at + INTERVAL '24 hours'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_call_in_expiry
  BEFORE INSERT ON public.driver_call_ins
  FOR EACH ROW EXECUTE FUNCTION public.set_call_in_expiry();

CREATE TRIGGER trg_call_ins_updated_at
  BEFORE UPDATE ON public.driver_call_ins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_geofences_updated_at
  BEFORE UPDATE ON public.vehicle_geofences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: create geofence + suspend payments on active call-in insert
CREATE OR REPLACE FUNCTION public.on_call_in_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.geofence_lat IS NOT NULL AND NEW.geofence_lng IS NOT NULL THEN
    INSERT INTO public.vehicle_geofences (vehicle_id, call_in_id, center_lat, center_lng, radius_m)
    VALUES (NEW.vehicle_id, NEW.id, NEW.geofence_lat, NEW.geofence_lng, NEW.geofence_radius_m);
  END IF;

  UPDATE public.profiles
  SET payments_suspended = TRUE,
      suspended_reason = 'call_in_' || NEW.type::text,
      suspended_until = NEW.expires_at,
      suspended_call_in_id = NEW.id
  WHERE user_id = NEW.driver_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_call_in_created
  AFTER INSERT ON public.driver_call_ins
  FOR EACH ROW EXECUTE FUNCTION public.on_call_in_created();

-- Trigger: on status change away from active, clear suspension + deactivate geofence
CREATE OR REPLACE FUNCTION public.on_call_in_closed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE public.vehicle_geofences
    SET active = FALSE
    WHERE call_in_id = NEW.id AND active = TRUE;

    IF NEW.ended_at IS NULL THEN
      NEW.ended_at := now();
    END IF;

    -- Only clear suspension if no other active call-in exists for this driver
    IF NOT EXISTS (
      SELECT 1 FROM public.driver_call_ins
      WHERE driver_id = NEW.driver_id AND status = 'active' AND id <> NEW.id
    ) THEN
      UPDATE public.profiles
      SET payments_suspended = FALSE,
          suspended_reason = NULL,
          suspended_until = NULL,
          suspended_call_in_id = NULL
      WHERE user_id = NEW.driver_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_call_in_closed
  BEFORE UPDATE OF status ON public.driver_call_ins
  FOR EACH ROW EXECUTE FUNCTION public.on_call_in_closed();
