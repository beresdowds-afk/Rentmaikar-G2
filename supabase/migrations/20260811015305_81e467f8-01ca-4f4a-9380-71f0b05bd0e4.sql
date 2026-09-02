CREATE OR REPLACE FUNCTION public.prevent_overlapping_booking_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'The end date must be on or after the start date.'
      USING ERRCODE = '22007';
  END IF;

  IF NEW.status NOT IN ('pending', 'offer_sent', 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT r.start_date, r.end_date INTO v_start, v_end
  FROM public.vehicle_booking_requests r
  WHERE r.vehicle_id = NEW.vehicle_id
    AND r.id IS DISTINCT FROM NEW.id
    AND r.status IN ('pending', 'offer_sent', 'accepted')
    AND r.start_date IS NOT NULL
    AND r.end_date IS NOT NULL
    AND r.start_date <= NEW.end_date
    AND r.end_date >= NEW.start_date
  ORDER BY r.start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'BOOKING_DATES_UNAVAILABLE: this vehicle already has a booking request from % to %.', v_start, v_end
      USING ERRCODE = '23P01';
  END IF;

  SELECT rn.start_date, COALESCE(rn.extended_end_date, rn.end_date) INTO v_start, v_end
  FROM public.rentals rn
  WHERE rn.vehicle_id = NEW.vehicle_id
    AND COALESCE(rn.status, 'active') IN ('active', 'pending', 'extended')
    AND rn.start_date IS NOT NULL
    AND rn.start_date <= NEW.end_date
    AND COALESCE(rn.extended_end_date, rn.end_date, NEW.end_date) >= NEW.start_date
  ORDER BY rn.start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'BOOKING_DATES_UNAVAILABLE: this vehicle is already rented from % to %.', v_start, COALESCE(v_end, v_start)
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_overlapping_booking_requests() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vbr_no_overlap ON public.vehicle_booking_requests;
CREATE TRIGGER trg_vbr_no_overlap
BEFORE INSERT OR UPDATE OF start_date, end_date, status, vehicle_id
ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_booking_requests();

CREATE OR REPLACE FUNCTION public.check_vehicle_booking_availability(
  _vehicle_id uuid,
  _start date,
  _end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflicts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _vehicle_id IS NULL OR _start IS NULL OR _end IS NULL OR _end < _start THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_range', 'conflicts', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'start_date'), '[]'::jsonb) INTO v_conflicts
  FROM (
    SELECT jsonb_build_object('kind', 'request', 'start_date', r.start_date, 'end_date', r.end_date) AS x
    FROM public.vehicle_booking_requests r
    WHERE r.vehicle_id = _vehicle_id
      AND r.status IN ('pending', 'offer_sent', 'accepted')
      AND r.start_date <= _end
      AND r.end_date >= _start
    UNION ALL
    SELECT jsonb_build_object(
             'kind', 'rental',
             'start_date', rn.start_date,
             'end_date', COALESCE(rn.extended_end_date, rn.end_date)
           )
    FROM public.rentals rn
    WHERE rn.vehicle_id = _vehicle_id
      AND COALESCE(rn.status, 'active') IN ('active', 'pending', 'extended')
      AND rn.start_date <= _end
      AND COALESCE(rn.extended_end_date, rn.end_date, _end) >= _start
  ) s;

  RETURN jsonb_build_object(
    'available', v_conflicts = '[]'::jsonb,
    'conflicts', v_conflicts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_vehicle_booking_availability(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_vehicle_booking_availability(uuid, date, date) TO authenticated;

ALTER TABLE public.inbox_conversations DROP CONSTRAINT IF EXISTS inbox_conversations_channel_check;
ALTER TABLE public.inbox_conversations ADD CONSTRAINT inbox_conversations_channel_check
  CHECK (channel = ANY (ARRAY['email','whatsapp','sms','facebook','instagram','linkedin','google']));

INSERT INTO public.social_messaging_configs (platform, display_name, is_enabled)
VALUES
  ('google_business', 'Google Business Messages', false),
  ('linkedin_pages', 'LinkedIn Pages', false)
ON CONFLICT DO NOTHING;