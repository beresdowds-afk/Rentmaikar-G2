
CREATE TABLE public.driver_vehicle_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  owner_id uuid,
  status text NOT NULL DEFAULT 'assigned',
  distance_miles numeric,
  region text,
  agreement_id uuid REFERENCES public.legal_agreements(id) ON DELETE SET NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  agreement_initiated_at timestamptz,
  agreement_signed_at timestamptz,
  accredited_at timestamptz,
  picked_up_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  licence_document_id uuid,
  referee_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_vehicle_matches_status_check CHECK (status IN
    ('assigned','agreement_initiated','agreement_signed','accredited','picked_up','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_vehicle_matches TO authenticated;
GRANT ALL ON public.driver_vehicle_matches TO service_role;
ALTER TABLE public.driver_vehicle_matches ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX driver_vehicle_matches_active_uniq
  ON public.driver_vehicle_matches (vehicle_id, driver_id)
  WHERE status <> 'cancelled';
CREATE INDEX driver_vehicle_matches_driver_idx ON public.driver_vehicle_matches (driver_id);
CREATE INDEX driver_vehicle_matches_owner_idx ON public.driver_vehicle_matches (owner_id);

CREATE POLICY "Admins manage driver vehicle matches"
  ON public.driver_vehicle_matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'admin_assistant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'admin_assistant'));

CREATE POLICY "Parties view their driver vehicle matches"
  ON public.driver_vehicle_matches FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR owner_id = auth.uid());

CREATE TABLE public.driver_vehicle_match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.driver_vehicle_matches(id) ON DELETE CASCADE,
  stage text NOT NULL,
  actor_id uuid,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.driver_vehicle_match_events TO authenticated;
GRANT ALL ON public.driver_vehicle_match_events TO service_role;
ALTER TABLE public.driver_vehicle_match_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX driver_vehicle_match_events_match_idx ON public.driver_vehicle_match_events (match_id, created_at DESC);

CREATE POLICY "Admins view match events"
  ON public.driver_vehicle_match_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'admin_assistant'));

CREATE POLICY "Parties view their match events"
  ON public.driver_vehicle_match_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.driver_vehicle_matches m
    WHERE m.id = match_id AND (m.driver_id = auth.uid() OR m.owner_id = auth.uid())
  ));

CREATE TRIGGER update_driver_vehicle_matches_updated_at
  BEFORE UPDATE ON public.driver_vehicle_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Internal helper: log a stage, notify parties + admins and publish an admin to-do.
CREATE OR REPLACE FUNCTION public._match_broadcast(
  _match public.driver_vehicle_matches,
  _stage text,
  _subject text,
  _driver_body text,
  _owner_body text,
  _task_title text,
  _task_description text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link text := '/admin/driver-matching';
BEGIN
  INSERT INTO public.driver_vehicle_match_events (match_id, stage, actor_id, message)
  VALUES (_match.id, _stage, auth.uid(), _subject);

  IF _driver_body IS NOT NULL THEN
    INSERT INTO public.in_app_messages (recipient_id, category, subject, body, link_url, metadata)
    VALUES (_match.driver_id, 'matching', _subject, _driver_body, '/driver-dashboard',
            jsonb_build_object('match_id', _match.id, 'stage', _stage));
  END IF;

  IF _owner_body IS NOT NULL AND _match.owner_id IS NOT NULL THEN
    INSERT INTO public.in_app_messages (recipient_id, category, subject, body, link_url, metadata)
    VALUES (_match.owner_id, 'matching', _subject, _owner_body, '/owner-dashboard',
            jsonb_build_object('match_id', _match.id, 'stage', _stage));
  END IF;

  INSERT INTO public.admin_notifications (recipient_id, kind, title, body, related_user_id, metadata)
  SELECT ur.user_id, 'driver_vehicle_match', _subject, coalesce(_task_description, _subject),
         _match.driver_id, jsonb_build_object('match_id', _match.id, 'stage', _stage, 'link', _link)
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','admin_assistant');

  IF _task_title IS NOT NULL THEN
    INSERT INTO public.admin_daily_tasks (task_date, category, title, description, priority, source_id, source_table)
    VALUES (current_date, 'driver_matching', _task_title, _task_description, 'high',
            _match.id::text, 'driver_vehicle_matches');
  END IF;
END;
$$;

-- Accreditation snapshot for a driver: licence document + referees.
CREATE OR REPLACE FUNCTION public.driver_accreditation_status(_driver_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'licence_document_id', (
      SELECT d.id FROM public.user_documents d
      WHERE d.user_id = _driver_id
        AND d.document_type IN ('driver_license','drivers_license','driving_licence','driver_licence')
      ORDER BY (d.status = 'verified') DESC, d.created_at DESC LIMIT 1),
    'licence_status', (
      SELECT d.status FROM public.user_documents d
      WHERE d.user_id = _driver_id
        AND d.document_type IN ('driver_license','drivers_license','driving_licence','driver_licence')
      ORDER BY (d.status = 'verified') DESC, d.created_at DESC LIMIT 1),
    'referee_count', (
      SELECT count(*) FROM public.referee_verifications r WHERE r.user_id = _driver_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_driver_to_vehicle(
  _vehicle_id uuid, _driver_id uuid, _distance_miles numeric DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.driver_vehicle_matches;
  _owner uuid;
  _label text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT v.owner_id, concat_ws(' ', v.year, v.make, v.model)
    INTO _owner, _label FROM public.vehicles v WHERE v.id = _vehicle_id;
  IF _label IS NULL THEN RAISE EXCEPTION 'vehicle not found'; END IF;

  INSERT INTO public.driver_vehicle_matches (vehicle_id, driver_id, owner_id, distance_miles, assigned_by, notes)
  VALUES (_vehicle_id, _driver_id, _owner, _distance_miles, auth.uid(), _notes)
  RETURNING * INTO _m;

  PERFORM public._match_broadcast(_m, 'assigned',
    'Vehicle option assigned',
    format('You have been matched with %s. It is now ready for the owner-driver agreement.', _label),
    format('A driver has been matched to your vehicle %s. The rental agreement will follow.', _label),
    format('Start agreement for %s', _label),
    'Driver assigned to a provisioned vehicle. Initiate the owner-driver agreement.');

  RETURN _m.id;
END;
$$;

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
    'Your rental agreement is ready. Sign it and make sure your driver''s licence and referee details are submitted.',
    'The rental agreement for your vehicle has been started. Please review and sign.',
    'Collect signatures on the rental agreement',
    'Agreement initiated. Chase driver and owner signatures, then witness the agreement.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_match_agreement_signed(_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _m public.driver_vehicle_matches; _a public.legal_agreements;
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

  UPDATE public.driver_vehicle_matches
     SET status = 'agreement_signed', agreement_signed_at = now()
   WHERE id = _match_id RETURNING * INTO _m;

  PERFORM public._match_broadcast(_m, 'agreement_signed',
    'Rental agreement fully executed',
    'Your rental agreement is fully signed. Accreditation checks are next.',
    'The rental agreement for your vehicle is fully signed.',
    'Run accreditation checks',
    'Agreement signed. Confirm the driver''s licence and referee details before handover.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_accredit_match(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _m public.driver_vehicle_matches; _s jsonb;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'admin_assistant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _m FROM public.driver_vehicle_matches WHERE id = _match_id;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
  IF _m.status <> 'agreement_signed' THEN RAISE EXCEPTION 'agreement must be fully signed first'; END IF;

  _s := public.driver_accreditation_status(_m.driver_id);
  IF (_s->>'licence_document_id') IS NULL THEN
    RAISE EXCEPTION 'driver has not submitted a driver''s licence';
  END IF;
  IF coalesce((_s->>'referee_count')::int, 0) < 1 THEN
    RAISE EXCEPTION 'driver has not provided any referee';
  END IF;

  UPDATE public.driver_vehicle_matches
     SET status = 'accredited', accredited_at = now(),
         licence_document_id = (_s->>'licence_document_id')::uuid,
         referee_count = (_s->>'referee_count')::int
   WHERE id = _match_id RETURNING * INTO _m;

  PERFORM public._match_broadcast(_m, 'accredited',
    'Accreditation complete',
    'You are accredited for this vehicle. Arrange pickup with the admin team.',
    'The matched driver is fully accredited. Vehicle handover can proceed.',
    'Arrange vehicle handover',
    'Driver accredited. Coordinate pickup and confirm handover once complete.');

  RETURN _s;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_match_picked_up(_match_id uuid)
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
     SET status = 'picked_up', picked_up_at = now()
   WHERE id = _match_id AND status = 'accredited'
  RETURNING * INTO _m;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match must be accredited before pickup'; END IF;

  PERFORM public._match_broadcast(_m, 'picked_up',
    'Vehicle picked up',
    'Vehicle pickup confirmed. Your rental is now active.',
    'Your vehicle has been picked up by the matched driver.',
    NULL, 'Vehicle handover confirmed.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_match(_match_id uuid, _reason text DEFAULT NULL)
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
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = _reason
   WHERE id = _match_id AND status <> 'cancelled'
  RETURNING * INTO _m;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;

  PERFORM public._match_broadcast(_m, 'cancelled',
    'Vehicle match cancelled',
    coalesce(_reason, 'This vehicle match has been cancelled.'),
    coalesce(_reason, 'A driver match for your vehicle has been cancelled.'),
    NULL, 'Match cancelled.');
END;
$$;
