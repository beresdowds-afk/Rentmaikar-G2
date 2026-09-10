-- Migration: Referee-Gated Vehicle Provisioning, Agreement-Signed Disabling, and Bad Report Lockdown/Recall
-- 1. Ensure columns exist on public.vehicles
ALTER TABLE public.vehicles 
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS lockdown_reason text;

-- 2. Ensure vehicle_enabled column on public.driver_vehicle_matches
ALTER TABLE public.driver_vehicle_matches
  ADD COLUMN IF NOT EXISTS vehicle_enabled boolean NOT NULL DEFAULT false;

-- Index for speedy queries
CREATE INDEX IF NOT EXISTS idx_vehicles_is_enabled ON public.vehicles(is_enabled);
CREATE INDEX IF NOT EXISTS idx_matches_vehicle_enabled ON public.driver_vehicle_matches(vehicle_enabled);

-- 3. Update admin_assign_driver_to_vehicle with referee reminder
CREATE OR REPLACE FUNCTION public.admin_assign_driver_to_vehicle(
  _driver_id uuid,
  _vehicle_id uuid,
  _distance_miles numeric DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.driver_vehicle_matches;
  _v public.vehicles;
  _d public.profiles;
  _label text;
  _referee_count int;
  _driver_status jsonb;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _v FROM public.vehicles WHERE id = _vehicle_id;
  IF _v.id IS NULL THEN RAISE EXCEPTION 'vehicle not found'; END IF;

  SELECT * INTO _d FROM public.profiles WHERE id = _driver_id;
  IF _d.id IS NULL THEN RAISE EXCEPTION 'driver profile not found'; END IF;

  -- Check referee count
  _driver_status := public.driver_accreditation_status(_driver_id);
  _referee_count := coalesce((_driver_status->>'referee_count')::int, 0);

  -- Prevent duplicate active match for this driver/vehicle pair
  IF EXISTS (
    SELECT 1 FROM public.driver_vehicle_matches
     WHERE vehicle_id = _vehicle_id AND driver_id = _driver_id
       AND status NOT IN ('cancelled', 'picked_up')
  ) THEN
    RAISE EXCEPTION 'active match already exists for this driver and vehicle';
  END IF;

  INSERT INTO public.driver_vehicle_matches
    (vehicle_id, driver_id, owner_id, status, assigned_by, distance_miles, notes,
     referee_count, vehicle_enabled)
  VALUES
    (_vehicle_id, _driver_id, _v.owner_id, 'assigned', auth.uid(), _distance_miles, _notes,
     _referee_count, (_referee_count >= 1))
  RETURNING * INTO _m;

  INSERT INTO public.driver_vehicle_match_events
    (match_id, actor_id, from_status, to_status, action, details)
  VALUES
    (_m.id, auth.uid(), NULL, 'assigned', 'assigned',
     jsonb_build_object('distance_miles', _distance_miles, 'notes', _notes, 'referees_submitted', (_referee_count >= 1)));

  _label := concat_ws(' ', _v.year::text, _v.make, _v.model, '(' || _v.license_plate || ')');

  PERFORM public._match_broadcast(_m, 'assigned',
    'Vehicle option assigned',
    format('You have been matched with %s. Important: Please ensure your 3 referee contact details are submitted. Provisioned vehicles are disabled upon signing the agreement and only enabled once referee details are submitted.', _label),
    format('A driver has been matched to your vehicle %s. The rental agreement will follow.', _label),
    format('Start agreement for %s', _label),
    'Driver assigned to a provisioned vehicle. Ensure driver is reminded to submit referee contacts before pickup.');

  RETURN _m.id;
END;
$$;

-- 4. Update admin_initiate_match_agreement with reminder
CREATE OR REPLACE FUNCTION public.admin_initiate_match_agreement(_match_id uuid, _agreement_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _m public.driver_vehicle_matches;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  UPDATE public.driver_vehicle_matches
     SET status = 'agreement_initiated',
         agreement_initiated_at = now(),
         agreement_id = coalesce(_agreement_id, agreement_id)
   WHERE id = _match_id AND status IN ('assigned','agreement_initiated')
  RETURNING * INTO _m;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match not found or not in an assignable state'; END IF;

  PERFORM public._match_broadcast(_m, 'agreement_initiated',
    'Rental agreement started',
    'Your rental agreement is ready. Note: The provisioned vehicle is disabled immediately upon signing the agreement and only enabled after you submit your referee contact details.',
    'The rental agreement for your vehicle has been started. Please review and sign.',
    'Collect signatures on the rental agreement',
    'Agreement initiated. Remind driver to submit referee contacts so the vehicle can be enabled for pickup.');
END;
$$;

-- 5. Update admin_mark_match_agreement_signed:
-- Immediately disables provisioned vehicle if referee details have NOT been submitted,
-- and enables it ONLY after referee details are provided.
CREATE OR REPLACE FUNCTION public.admin_mark_match_agreement_signed(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.driver_vehicle_matches;
  _a public.legal_agreements;
  _s jsonb;
  _referee_count int;
  _vehicle_enabled boolean;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _m FROM public.driver_vehicle_matches WHERE id = _match_id;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
  IF _m.agreement_id IS NULL THEN RAISE EXCEPTION 'no agreement linked to this match'; END IF;

  SELECT * INTO _a FROM public.legal_agreements WHERE id = _m.agreement_id;
  IF _a.driver_signature IS NULL OR _a.owner_signature IS NULL OR _a.admin_witness_signature IS NULL THEN
    RAISE EXCEPTION 'agreement is not fully signed yet';
  END IF;

  -- Check referee count
  _s := public.driver_accreditation_status(_m.driver_id);
  _referee_count := coalesce((_s->>'referee_count')::int, 0);

  -- Provisioned vehicles should be disabled immediately the owner-driver agreement is signed,
  -- and only enabled after the submission of referee details by the driver.
  IF _referee_count < 1 THEN
    _vehicle_enabled := false;
    UPDATE public.vehicles
       SET is_enabled = false,
           disabled_reason = 'awaiting_referee_submission',
           disabled_at = now()
     WHERE id = _m.vehicle_id;

    UPDATE public.driver_vehicle_matches
       SET status = 'agreement_signed',
           agreement_signed_at = now(),
           vehicle_enabled = false,
           referee_count = _referee_count
     WHERE id = _match_id
     RETURNING * INTO _m;

    INSERT INTO public.driver_vehicle_match_events
      (match_id, actor_id, from_status, to_status, action, details)
    VALUES
      (_match_id, auth.uid(), 'agreement_initiated', 'agreement_signed', 'agreement_signed_vehicle_disabled',
       jsonb_build_object('referee_count', _referee_count, 'vehicle_enabled', false, 'reason', 'Vehicle disabled awaiting referee submission'));

    PERFORM public._match_broadcast(_m, 'agreement_signed',
      'Agreement signed — Referee submission required',
      'Your rental agreement is signed! Note: Your provisioned vehicle is disabled and will ONLY be enabled for pickup after you submit your referee contact details.',
      'The rental agreement for your vehicle is fully signed. The vehicle is currently disabled pending driver referee submission.',
      'Awaiting referee submission',
      'Agreement signed. Provisioned vehicle is disabled pending driver referee details.');
  ELSE
    _vehicle_enabled := true;
    UPDATE public.vehicles
       SET is_enabled = true,
           disabled_reason = null,
           enabled_at = now()
     WHERE id = _m.vehicle_id;

    UPDATE public.driver_vehicle_matches
       SET status = 'agreement_signed',
           agreement_signed_at = now(),
           vehicle_enabled = true,
           referee_count = _referee_count
     WHERE id = _match_id
     RETURNING * INTO _m;

    INSERT INTO public.driver_vehicle_match_events
      (match_id, actor_id, from_status, to_status, action, details)
    VALUES
      (_match_id, auth.uid(), 'agreement_initiated', 'agreement_signed', 'agreement_signed_vehicle_enabled',
       jsonb_build_object('referee_count', _referee_count, 'vehicle_enabled', true));

    PERFORM public._match_broadcast(_m, 'agreement_signed',
      'Rental agreement fully executed',
      'Your rental agreement is fully signed and your referees are on file. Accreditation checks are next.',
      'The rental agreement for your vehicle is fully signed.',
      'Run accreditation checks',
      'Agreement signed and referees verified. Confirm driver''s licence before handover.');
  END IF;
END;
$$;

-- 6. Condition at pickup: Provisioned vehicle MUST be enabled and have referee details
CREATE OR REPLACE FUNCTION public.admin_mark_match_picked_up(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.driver_vehicle_matches;
  _v public.vehicles;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _m FROM public.driver_vehicle_matches WHERE id = _match_id;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
  IF _m.status <> 'accredited' THEN RAISE EXCEPTION 'match must be accredited before pickup'; END IF;

  -- CONDITION TO ENABLE AT PICKUP:
  IF NOT coalesce(_m.vehicle_enabled, false) THEN
    RAISE EXCEPTION 'Cannot complete pickup: Provisioned vehicle is disabled. Driver must submit referee details before the vehicle can be enabled for pickup.';
  END IF;

  SELECT * INTO _v FROM public.vehicles WHERE id = _m.vehicle_id;
  IF _v.is_enabled IS FALSE THEN
    RAISE EXCEPTION 'Cannot complete pickup: Vehicle is currently disabled (%). Resolve condition before handover.', coalesce(_v.disabled_reason, 'unknown');
  END IF;

  UPDATE public.driver_vehicle_matches
     SET status = 'picked_up', picked_up_at = now()
   WHERE id = _match_id AND status = 'accredited'
  RETURNING * INTO _m;

  INSERT INTO public.driver_vehicle_match_events
    (match_id, actor_id, from_status, to_status, action, details)
  VALUES
    (_match_id, auth.uid(), 'accredited', 'picked_up', 'picked_up',
     jsonb_build_object('vehicle_id', _m.vehicle_id, 'referee_count', _m.referee_count));

  PERFORM public._match_broadcast(_m, 'picked_up',
    'Vehicle picked up',
    'Vehicle pickup confirmed. Your provisioned vehicle is enabled and your rental is now active.',
    'Your vehicle has been picked up by the matched driver.',
    NULL, 'Vehicle handover confirmed.');
END;
$$;

-- 7. Update submit_driver_referees to enable matched provisioned vehicles
CREATE OR REPLACE FUNCTION public.submit_driver_referees(_referees jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _app record;
  _i int;
  _r jsonb;
  _match record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF _referees IS NULL OR jsonb_typeof(_referees) <> 'array' OR jsonb_array_length(_referees) <> 3 THEN
    RAISE EXCEPTION 'Exactly 3 referees are required';
  END IF;

  SELECT id INTO _app FROM public.applications
   WHERE user_id = _uid AND application_type = 'driver'
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No driver application found for this user';
  END IF;

  -- Store referees on application
  UPDATE public.applications
     SET referee1_name  = nullif(trim(_referees->0->>'name'), ''),
         referee1_phone = nullif(trim(_referees->0->>'phone'), ''),
         referee1_email = nullif(trim(_referees->0->>'email'), ''),
         referee2_name  = nullif(trim(_referees->1->>'name'), ''),
         referee2_phone = nullif(trim(_referees->1->>'phone'), ''),
         referee2_email = nullif(trim(_referees->1->>'email'), ''),
         referee3_name  = nullif(trim(_referees->2->>'name'), ''),
         referee3_phone = nullif(trim(_referees->2->>'phone'), ''),
         referee3_email = nullif(trim(_referees->2->>'email'), ''),
         referees_verification_status = 'pending',
         updated_at = now()
   WHERE id = _app.id;

  -- Upsert individual referee verifications
  FOR _i IN 0..2 LOOP
    _r := _referees -> _i;
    INSERT INTO public.referee_verifications
      (application_id, user_id, referee_index, full_name, phone, email)
    VALUES
      (_app.id, _uid, _i, trim(_r->>'name'), trim(_r->>'phone'),
       nullif(trim(coalesce(_r->>'email','')), ''))
    ON CONFLICT (application_id, referee_index) DO UPDATE SET
      full_name  = excluded.full_name,
      phone      = excluded.phone,
      email      = excluded.email,
      status     = 'pending',
      updated_at = now();
  END LOOP;

  -- ENABLE PROVISIONED VEHICLES FOR THIS DRIVER:
  -- "and only enabled, after the submission of referee details by the driver."
  FOR _match IN
    SELECT id, vehicle_id, status FROM public.driver_vehicle_matches
     WHERE driver_id = _uid AND status IN ('assigned', 'agreement_initiated', 'agreement_signed', 'accredited')
  LOOP
    -- Enable vehicle record
    UPDATE public.vehicles
       SET is_enabled = true,
           disabled_reason = null,
           enabled_at = now()
     WHERE id = _match.vehicle_id;

    -- Enable match record
    UPDATE public.driver_vehicle_matches
       SET vehicle_enabled = true,
           referee_count = 3
     WHERE id = _match.id;

    -- Record audit event
    INSERT INTO public.driver_vehicle_match_events
      (match_id, actor_id, from_status, to_status, action, details)
    VALUES
      (_match.id, _uid, _match.status, _match.status, 'referees_submitted_vehicle_enabled',
       jsonb_build_object('vehicle_id', _match.vehicle_id, 'vehicle_enabled', true, 'referee_count', 3));
  END LOOP;

  -- Notify driver
  INSERT INTO public.inbox_messages
    (user_id, direction, channel, subject, body, status)
  VALUES
    (_uid, 'inbound', 'system',
     'Referee details submitted — Provisioned vehicle enabled',
     'Your 3 referee contacts have been received. Your provisioned vehicle has been enabled for pickup once handover is completed.',
     'unread');

  INSERT INTO public.application_audit_log (application_id, actor_id, actor_role, action, changed, details)
  VALUES (_app.id, _uid, 'driver', 'referees_submitted', '["referees"]'::jsonb,
          jsonb_build_object('count', 3, 'provisioned_vehicles_enabled', true));

  RETURN _app.id;
END;
$$;

-- 8. Enhance get_my_pickup_details to check both driver_vehicle_matches AND rentals,
-- returning vehicle_enabled status so driver knows if vehicle is currently disabled awaiting referees.
CREATE OR REPLACE FUNCTION public.get_my_pickup_details()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _vehicle record;
  _submitted boolean;
  _vehicle_enabled boolean;
  _disabled_reason text;
  _match_id uuid;
  _match_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1. Check active rental first
  SELECT r.id as rental_id, v.id as vehicle_id, v.make, v.model, v.year,
         v.license_plate, v.pickup_location, v.pickup_address,
         v.pickup_city, v.pickup_instructions, v.is_enabled, v.disabled_reason,
         NULL::uuid as match_id, 'active_rental' as match_status
    INTO _vehicle
    FROM public.rentals r
    JOIN public.vehicles v ON v.id = r.vehicle_id
   WHERE r.driver_id = _uid AND r.status = 'active'
   ORDER BY r.created_at DESC LIMIT 1;

  -- 2. If no active rental, check driver_vehicle_matches
  IF NOT FOUND THEN
    SELECT NULL::uuid as rental_id, v.id as vehicle_id, v.make, v.model, v.year,
           v.license_plate, v.pickup_location, v.pickup_address,
           v.pickup_city, v.pickup_instructions, v.is_enabled, v.disabled_reason,
           m.id as match_id, m.status as match_status
      INTO _vehicle
      FROM public.driver_vehicle_matches m
      JOIN public.vehicles v ON v.id = m.vehicle_id
     WHERE m.driver_id = _uid
       AND m.status IN ('assigned', 'agreement_initiated', 'agreement_signed', 'accredited', 'picked_up')
     ORDER BY m.created_at DESC LIMIT 1;
  END IF;

  IF _vehicle.vehicle_id IS NULL THEN
    RETURN jsonb_build_object('has_rental', false, 'referees_submitted', false);
  END IF;

  -- Check if driver has submitted 3 referees
  SELECT exists (
    SELECT 1 FROM public.applications a
     WHERE a.user_id = _uid AND a.application_type = 'driver'
       AND nullif(trim(coalesce(a.referee1_name,'')), '') IS NOT NULL
       AND nullif(trim(coalesce(a.referee1_phone,'')), '') IS NOT NULL
       AND nullif(trim(coalesce(a.referee2_name,'')), '') IS NOT NULL
       AND nullif(trim(coalesce(a.referee2_phone,'')), '') IS NOT NULL
       AND nullif(trim(coalesce(a.referee3_name,'')), '') IS NOT NULL
       AND nullif(trim(coalesce(a.referee3_phone,'')), '') IS NOT NULL
  ) INTO _submitted;

  _vehicle_enabled := coalesce(_vehicle.is_enabled, true);
  _disabled_reason := _vehicle.disabled_reason;

  RETURN jsonb_build_object(
    'has_rental', true,
    'referees_submitted', _submitted,
    'vehicle_enabled', _vehicle_enabled,
    'disabled_reason', _disabled_reason,
    'match_id', _vehicle.match_id,
    'match_status', _vehicle.match_status,
    'rental_id', _vehicle.rental_id,
    'vehicle', jsonb_build_object(
      'id', _vehicle.vehicle_id,
      'make', _vehicle.make, 'model', _vehicle.model,
      'year', _vehicle.year, 'license_plate', _vehicle.license_plate),
    'pickup', CASE WHEN _submitted THEN jsonb_build_object(
        'location', _vehicle.pickup_location,
        'address', _vehicle.pickup_address,
        'city', _vehicle.pickup_city,
        'instructions', _vehicle.pickup_instructions)
      ELSE NULL END
  );
END;
$$;

-- 9. Security Lockdown & Recall function when bad report by referee is received
CREATE OR REPLACE FUNCTION public.lockdown_and_recall_vehicle(
  _driver_id uuid,
  _reason text,
  _referee_name text DEFAULT 'Referee'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match record;
  _rental record;
  _target_vehicle_id uuid;
  _target_owner_id uuid;
  _recall_id uuid;
  _device record;
  _vehicle_label text;
  _v public.vehicles;
BEGIN
  -- Search in matches
  SELECT m.id as match_id, m.vehicle_id, m.owner_id, v.make, v.model, v.year, v.license_plate
    INTO _match
    FROM public.driver_vehicle_matches m
    JOIN public.vehicles v ON v.id = m.vehicle_id
   WHERE m.driver_id = _driver_id AND m.status NOT IN ('cancelled')
   ORDER BY m.created_at DESC LIMIT 1;

  IF _match.vehicle_id IS NOT NULL THEN
    _target_vehicle_id := _match.vehicle_id;
    _target_owner_id := _match.owner_id;
    _vehicle_label := concat_ws(' ', _match.year::text, _match.make, _match.model, '(' || _match.license_plate || ')');
  ELSE
    -- Search in active rentals
    SELECT r.id as rental_id, r.vehicle_id, v.owner_id, v.make, v.model, v.year, v.license_plate
      INTO _rental
      FROM public.rentals r
      JOIN public.vehicles v ON v.id = r.vehicle_id
     WHERE r.driver_id = _driver_id AND r.status = 'active'
     ORDER BY r.created_at DESC LIMIT 1;

    IF _rental.vehicle_id IS NOT NULL THEN
      _target_vehicle_id := _rental.vehicle_id;
      _target_owner_id := _rental.owner_id;
      _vehicle_label := concat_ws(' ', _rental.year::text, _rental.make, _rental.model, '(' || _rental.license_plate || ')');
    END IF;
  END IF;

  IF _target_vehicle_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No active matched or rented vehicle found for driver');
  END IF;

  -- 1. VEHICLE LOCKDOWN
  UPDATE public.vehicles
     SET is_enabled = false,
         status = 'locked_down',
         disabled_reason = 'referee_bad_report',
         lockdown_reason = _reason,
         disabled_at = now()
   WHERE id = _target_vehicle_id;

  -- Update match if exists
  IF _match.match_id IS NOT NULL THEN
    UPDATE public.driver_vehicle_matches
       SET vehicle_enabled = false
     WHERE id = _match.match_id;

    INSERT INTO public.driver_vehicle_match_events
      (match_id, actor_id, from_status, to_status, action, details)
    VALUES
      (_match.match_id, auth.uid(), _match.match_id::text, 'locked_down', 'referee_bad_report_lockdown',
       jsonb_build_object('reason', _reason, 'referee', _referee_name));
  END IF;

  -- 2. CREATE VEHICLE RECALL
  INSERT INTO public.vehicle_recalls
    (vehicle_id, driver_id, owner_id, recall_reason, recall_type, status, priority)
  VALUES
    (_target_vehicle_id, _driver_id, _target_owner_id,
     format('SECURITY LOCKDOWN & RECALL: Adverse referee report received from %s. Reason: %s', _referee_name, _reason),
     'safety', 'pending', 'critical')
  RETURNING id INTO _recall_id;

  -- 3. LOG IOT DEVICE AUDIT
  SELECT id INTO _device FROM public.iot_devices WHERE vehicle_id = _target_vehicle_id AND is_linked = true LIMIT 1;
  IF _device.id IS NOT NULL THEN
    INSERT INTO public.device_activity_log
      (device_id, action, performed_by, details)
    VALUES
      (_device.id, 'LOCKDOWN', coalesce(auth.uid(), _driver_id),
       jsonb_build_object('trigger', 'referee_bad_report', 'referee', _referee_name, 'reason', _reason, 'recall_id', _recall_id));
  END IF;

  -- 4. NOTIFICATIONS
  -- To Driver:
  INSERT INTO public.inbox_messages
    (user_id, direction, channel, subject, body, status)
  VALUES
    (_driver_id, 'inbound', 'system',
     'SECURITY ALERT: Vehicle Lockdown & Immediate Recall',
     format('Your vehicle (%s) has been immobilized and recalled immediately following an adverse report from your referee (%s). Please contact support immediately.', _vehicle_label, _referee_name),
     'unread');

  -- To Owner:
  IF _target_owner_id IS NOT NULL THEN
    INSERT INTO public.inbox_messages
      (user_id, direction, channel, subject, body, status)
    VALUES
      (_target_owner_id, 'inbound', 'system',
       'URGENT: Vehicle Recalled & Locked Down',
       format('Vehicle %s has been placed in lockdown and an immediate recall initiated due to an adverse referee report on the matched driver.', _vehicle_label),
       'unread');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vehicle_id', _target_vehicle_id,
    'recall_id', _recall_id,
    'vehicle_label', _vehicle_label,
    'locked_down', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lockdown_and_recall_vehicle(uuid, text, text) TO authenticated, service_role;
