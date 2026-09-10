-- Migration: 20260910103000_fault_maintenance_call_in_renewals.sql
-- Fault/Maintenance call-ins renewable every 24hrs up to max 3, after which vehicle call-in process is initiated.

-- 1. Add renewal & recall tracking columns to driver_call_ins
ALTER TABLE public.driver_call_ins
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_renewals INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recall_initiated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recall_id UUID REFERENCES public.vehicle_recalls(id);

CREATE INDEX IF NOT EXISTS idx_call_ins_renewals ON public.driver_call_ins (renewal_count, max_renewals);

-- 2. Update column-scope guard for driver_call_ins to permit legitimate renewal executions
CREATE OR REPLACE FUNCTION public.enforce_call_in_column_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Unrestricted contexts: admins, assistant admins, service-role/edge-functions, or local renewal session override
  IF public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'admin_assistant')
     OR auth.uid() IS NULL
     OR current_setting('app.allow_call_in_renewal', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Non-admin (driver) updates: freeze protected columns except cancellation + extension request
  IF NEW.id                 IS DISTINCT FROM OLD.id
     OR NEW.driver_id       IS DISTINCT FROM OLD.driver_id
     OR NEW.rental_id       IS DISTINCT FROM OLD.rental_id
     OR NEW.vehicle_id      IS DISTINCT FROM OLD.vehicle_id
     OR NEW.type            IS DISTINCT FROM OLD.type
     OR NEW.reason          IS DISTINCT FROM OLD.reason
     OR NEW.notes           IS DISTINCT FROM OLD.notes
     OR NEW.telemetry_snapshot IS DISTINCT FROM OLD.telemetry_snapshot
     OR NEW.geofence_lat    IS DISTINCT FROM OLD.geofence_lat
     OR NEW.geofence_lng    IS DISTINCT FROM OLD.geofence_lng
     OR NEW.geofence_radius_m IS DISTINCT FROM OLD.geofence_radius_m
     OR NEW.started_at      IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at      IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at
     OR NEW.renewal_count   IS DISTINCT FROM OLD.renewal_count
     OR NEW.max_renewals    IS DISTINCT FROM OLD.max_renewals
     OR NEW.last_renewed_at IS DISTINCT FROM OLD.last_renewed_at
     OR NEW.recall_initiated IS DISTINCT FROM OLD.recall_initiated
     OR NEW.recall_id       IS DISTINCT FROM OLD.recall_id
  THEN
    RAISE EXCEPTION 'not authorized to modify protected call-in columns';
  END IF;

  -- status may only move to 'cancelled' from an active call-in
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status::text = 'active' AND NEW.status::text = 'cancelled') THEN
      RAISE EXCEPTION 'drivers may only cancel an active call-in';
    END IF;
  END IF;

  -- extension flag may only be raised, never lowered
  IF NEW.extend_requested IS DISTINCT FROM OLD.extend_requested
     AND COALESCE(NEW.extend_requested, false) = false THEN
    RAISE EXCEPTION 'not authorized to clear the extension request flag';
  END IF;

  -- ended_at/end_reason only allowed alongside a driver cancellation
  IF (NEW.ended_at IS DISTINCT FROM OLD.ended_at OR NEW.end_reason IS DISTINCT FROM OLD.end_reason)
     AND NEW.status::text <> 'cancelled' THEN
    RAISE EXCEPTION 'not authorized to modify call-in closure columns';
  END IF;

  RETURN NEW;
END $$;

-- 3. Core RPC function: renew_driver_call_in
-- Allows renewing fault/maintenance call-ins every 24hrs up to 3 times.
-- Once 3 renewals are reached, automatically initiates vehicle call-in/recall.
CREATE OR REPLACE FUNCTION public.renew_driver_call_in(
  p_call_in_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_call_in RECORD;
  v_vehicle RECORD;
  v_new_renewal_count INTEGER;
  v_new_expires_at TIMESTAMPTZ;
  v_recall_id UUID;
  v_appended_notes TEXT;
BEGIN
  -- Must be authenticated
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Fetch active call-in
  SELECT * INTO v_call_in
  FROM public.driver_call_ins
  WHERE id = p_call_in_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call-in not found');
  END IF;

  -- Authorization check: caller must be the driver or an admin
  IF v_call_in.driver_id <> v_caller
     AND NOT public.has_role(v_caller, 'admin')
     AND NOT public.has_role(v_caller, 'admin_assistant') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to renew this call-in');
  END IF;

  -- Status check
  IF v_call_in.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only active call-ins can be renewed');
  END IF;

  -- Type check: only fault and maintenance are eligible for 24h renewals
  IF v_call_in.type NOT IN ('fault', 'maintenance') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only Fault and Maintenance call-ins are eligible for 24-hour renewals'
    );
  END IF;

  -- Fetch vehicle details for recall owner reference
  SELECT * INTO v_vehicle
  FROM public.vehicles
  WHERE id = v_call_in.vehicle_id;

  -- Check if max renewals (3) already reached
  IF v_call_in.renewal_count >= COALESCE(v_call_in.max_renewals, 3) THEN
    -- Maximum renewals already reached! Initiate vehicle call in / recall process if not already initiated.
    IF NOT v_call_in.recall_initiated THEN
      -- Check if open recall already exists for this vehicle & call-in
      SELECT id INTO v_recall_id
      FROM public.vehicle_recalls
      WHERE vehicle_id = v_call_in.vehicle_id
        AND status IN ('requested', 'approved', 'in_progress', 'pending')
      LIMIT 1;

      IF v_recall_id IS NULL THEN
        INSERT INTO public.vehicle_recalls (
          vehicle_id,
          driver_id,
          owner_id,
          recall_reason,
          recall_type,
          status,
          priority,
          triggered_by_call_ins
        ) VALUES (
          v_call_in.vehicle_id,
          v_call_in.driver_id,
          v_vehicle.owner_id,
          'Vehicle fault/maintenance call-in reached maximum 3 renewals (72h grounded). Vehicle call-in process initiated for mandatory mechanical inspection.',
          'fault_maintenance_max_renewals',
          'requested',
          'high',
          ARRAY[v_call_in.id]
        ) RETURNING id INTO v_recall_id;
      END IF;

      -- Update call-in with recall initiation flag
      PERFORM set_config('app.allow_call_in_renewal', 'on', true);
      UPDATE public.driver_call_ins
      SET recall_initiated = TRUE,
          recall_id = v_recall_id,
          updated_at = now()
      WHERE id = v_call_in.id;
    ELSE
      v_recall_id := v_call_in.recall_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'renewed', false,
      'max_reached', true,
      'renewal_count', v_call_in.renewal_count,
      'max_renewals', v_call_in.max_renewals,
      'recall_initiated', true,
      'recall_id', v_recall_id,
      'message', 'Maximum 3 renewals reached. Vehicle call-in process has been initiated.'
    );
  END IF;

  -- Perform 24-hour renewal
  v_new_renewal_count := v_call_in.renewal_count + 1;
  -- Extend by 24h from current expires_at or now() if expired
  v_new_expires_at := GREATEST(v_call_in.expires_at, now()) + INTERVAL '24 hours';

  -- Format notes with renewal audit
  v_appended_notes := v_call_in.notes;
  IF p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN
    v_appended_notes := COALESCE(v_appended_notes || E'\n', '') ||
      '[Renewal #' || v_new_renewal_count || ' · ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']: ' || trim(p_notes);
  END IF;

  -- Bypass column guard in this local transaction
  PERFORM set_config('app.allow_call_in_renewal', 'on', true);

  UPDATE public.driver_call_ins
  SET renewal_count = v_new_renewal_count,
      expires_at = v_new_expires_at,
      last_renewed_at = now(),
      notes = v_appended_notes,
      updated_at = now()
  WHERE id = v_call_in.id;

  -- Keep driver profile payment suspension aligned with new expires_at
  UPDATE public.profiles
  SET suspended_until = v_new_expires_at
  WHERE user_id = v_call_in.driver_id;

  -- Ensure vehicle geofence remains active
  UPDATE public.vehicle_geofences
  SET active = TRUE,
      updated_at = now()
  WHERE call_in_id = v_call_in.id;

  -- If this renewal was the 3rd (maximum allowed), immediately initiate the vehicle call-in/recall!
  IF v_new_renewal_count >= COALESCE(v_call_in.max_renewals, 3) THEN
    INSERT INTO public.vehicle_recalls (
      vehicle_id,
      driver_id,
      owner_id,
      recall_reason,
      recall_type,
      status,
      priority,
      triggered_by_call_ins
    ) VALUES (
      v_call_in.vehicle_id,
      v_call_in.driver_id,
      v_vehicle.owner_id,
      'Vehicle fault/maintenance call-in reached maximum 3 renewals (72h grounded). Vehicle call-in process initiated for mandatory mechanical inspection.',
      'fault_maintenance_max_renewals',
      'requested',
      'high',
      ARRAY[v_call_in.id]
    ) RETURNING id INTO v_recall_id;

    UPDATE public.driver_call_ins
    SET recall_initiated = TRUE,
        recall_id = v_recall_id,
        updated_at = now()
    WHERE id = v_call_in.id;

    RETURN jsonb_build_object(
      'success', true,
      'renewed', true,
      'renewal_count', v_new_renewal_count,
      'max_renewals', COALESCE(v_call_in.max_renewals, 3),
      'expires_at', v_new_expires_at,
      'max_reached', true,
      'recall_initiated', true,
      'recall_id', v_recall_id,
      'message', 'Call-in renewed for final 24hrs (Renewal 3 of 3). Maximum renewals reached; vehicle call-in process has been initiated.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'renewed', true,
    'renewal_count', v_new_renewal_count,
    'max_renewals', COALESCE(v_call_in.max_renewals, 3),
    'expires_at', v_new_expires_at,
    'max_reached', false,
    'recall_initiated', false,
    'message', 'Call-in successfully renewed for 24 hours (Renewal ' || v_new_renewal_count || ' of 3).'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_driver_call_in(UUID, TEXT) TO authenticated, service_role;
