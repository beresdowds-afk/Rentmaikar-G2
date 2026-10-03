-- ============================================================================
-- Migration: 20261001092000_emergency_sos.sql
-- Tier 2 Feature 28: Emergency SOS Trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emergency_sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES auth.users(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  trigger_source text NOT NULL CHECK (trigger_source IN ('driver_button','iot','sms','system')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','dispatched','resolved','false_alarm')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_emergency_sos_events_driver
  ON public.emergency_sos_events(driver_id);

CREATE INDEX IF NOT EXISTS idx_emergency_sos_events_status
  ON public.emergency_sos_events(status);

CREATE INDEX IF NOT EXISTS idx_emergency_sos_events_created
  ON public.emergency_sos_events(created_at DESC);

ALTER TABLE public.emergency_sos_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view their own SOS events" ON public.emergency_sos_events;
CREATE POLICY "Drivers can view their own SOS events"
  ON public.emergency_sos_events
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can create SOS events" ON public.emergency_sos_events;
CREATE POLICY "Drivers can create SOS events"
  ON public.emergency_sos_events
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all SOS events" ON public.emergency_sos_events;
CREATE POLICY "Admins can manage all SOS events"
  ON public.emergency_sos_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

-- RPC for triggering driver emergency SOS atomically
CREATE OR REPLACE FUNCTION public.trigger_emergency_sos(
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL,
  _accuracy_m numeric DEFAULT NULL,
  _trigger_source text DEFAULT 'driver_button',
  _vehicle_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_veh uuid := _vehicle_id;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- If vehicle_id not provided, try to discover active assigned rental
  IF v_veh IS NULL THEN
    SELECT vehicle_id INTO v_veh
    FROM public.rentals
    WHERE driver_id = v_uid
      AND status IN ('active', 'in_progress', 'signed')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.emergency_sos_events (
    driver_id,
    vehicle_id,
    latitude,
    longitude,
    accuracy_m,
    trigger_source,
    status,
    metadata
  ) VALUES (
    v_uid,
    v_veh,
    _latitude,
    _longitude,
    _accuracy_m,
    COALESCE(_trigger_source, 'driver_button'),
    'open',
    _metadata
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'sos_id', v_event_id,
    'status', 'open',
    'created_at', now()
  );
END;
$$;
