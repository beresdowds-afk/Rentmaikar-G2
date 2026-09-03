-- 1. Public visibility flag
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

GRANT SELECT (is_public) ON public.vehicles TO anon;

CREATE OR REPLACE VIEW public.public_vehicle_listings AS
SELECT
  v.id,
  v.make,
  v.model,
  v.year,
  v.color,
  v.status,
  v.pickup_city,
  v.pickup_location,
  v.photo_urls,
  v.created_at
FROM public.vehicles v
WHERE v.status IN ('available', 'active') AND v.is_public = true;

ALTER VIEW public.public_vehicle_listings SET (security_barrier = true);
ALTER VIEW public.public_vehicle_listings SET (security_invoker = on);
GRANT SELECT ON public.public_vehicle_listings TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view available vehicles" ON public.vehicles;
CREATE POLICY "Public can view available vehicles"
ON public.vehicles
FOR SELECT
TO anon, authenticated
USING (status IN ('available', 'active') AND is_public = true);

-- 2. Booking requests
DO $$ BEGIN
  CREATE TYPE public.booking_request_status AS ENUM ('pending','offer_sent','accepted','declined','withdrawn','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  driver_message text,
  status public.booking_request_status NOT NULL DEFAULT 'pending',
  offered_rate numeric,
  offer_currency text,
  offer_note text,
  offer_expires_at timestamptz,
  offer_sent_at timestamptz,
  offer_sent_by uuid,
  responded_at timestamptz,
  reviewed_by uuid,
  review_note text,
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.vehicle_booking_requests TO authenticated;
GRANT UPDATE ON public.vehicle_booking_requests TO authenticated;
GRANT ALL ON public.vehicle_booking_requests TO service_role;

ALTER TABLE public.vehicle_booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own booking requests"
ON public.vehicle_booking_requests FOR SELECT TO authenticated
USING (driver_id = auth.uid() OR public.has_admin_privilege(auth.uid(), 'can_manage_content'));

CREATE POLICY "Drivers create own booking requests"
ON public.vehicle_booking_requests FOR INSERT TO authenticated
WITH CHECK (driver_id = auth.uid() AND status = 'pending' AND offered_rate IS NULL AND offer_sent_at IS NULL);

CREATE POLICY "Drivers update own pending requests"
ON public.vehicle_booking_requests FOR UPDATE TO authenticated
USING (driver_id = auth.uid() OR public.has_admin_privilege(auth.uid(), 'can_manage_content'))
WITH CHECK (driver_id = auth.uid() OR public.has_admin_privilege(auth.uid(), 'can_manage_content'));

CREATE INDEX IF NOT EXISTS idx_vbr_driver ON public.vehicle_booking_requests(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vbr_status ON public.vehicle_booking_requests(status, created_at DESC);

CREATE TRIGGER trg_vbr_updated_at
BEFORE UPDATE ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Column scope guard: drivers may not touch offer/status/review fields directly
CREATE OR REPLACE FUNCTION public.enforce_booking_request_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_admin_privilege(auth.uid(), 'can_manage_content') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.offered_rate IS DISTINCT FROM OLD.offered_rate
     OR NEW.offer_currency IS DISTINCT FROM OLD.offer_currency
     OR NEW.offer_note IS DISTINCT FROM OLD.offer_note
     OR NEW.offer_expires_at IS DISTINCT FROM OLD.offer_expires_at
     OR NEW.offer_sent_at IS DISTINCT FROM OLD.offer_sent_at
     OR NEW.offer_sent_by IS DISTINCT FROM OLD.offer_sent_by
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    RAISE EXCEPTION 'Only administrators can modify booking offer or status fields';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vbr_column_scope
BEFORE UPDATE ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_request_column_scope();

-- 3. RPCs
CREATE OR REPLACE FUNCTION public.submit_booking_request(
  _vehicle_id uuid,
  _start_date date,
  _end_date date,
  _message text DEFAULT NULL,
  _region text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _end_date < _start_date THEN
    RAISE EXCEPTION 'End date must be on or after the start date';
  END IF;
  IF _start_date < current_date THEN
    RAISE EXCEPTION 'Start date cannot be in the past';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = _vehicle_id AND v.is_public = true AND v.status IN ('available','active')
  ) THEN
    RAISE EXCEPTION 'This vehicle is not available for booking requests';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vehicle_booking_requests r
    WHERE r.driver_id = auth.uid() AND r.vehicle_id = _vehicle_id
      AND r.status IN ('pending','offer_sent')
  ) THEN
    RAISE EXCEPTION 'You already have an open request for this vehicle';
  END IF;

  INSERT INTO public.vehicle_booking_requests (vehicle_id, driver_id, start_date, end_date, driver_message, region)
  VALUES (_vehicle_id, auth.uid(), _start_date, _end_date, NULLIF(btrim(coalesce(_message,'')), ''), _region)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_booking_offer(
  _request_id uuid,
  _offered_rate numeric,
  _currency text,
  _note text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_privilege(auth.uid(), 'can_manage_content') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _offered_rate IS NULL OR _offered_rate <= 0 THEN
    RAISE EXCEPTION 'Offer rate must be greater than zero';
  END IF;

  UPDATE public.vehicle_booking_requests
  SET status = 'offer_sent',
      offered_rate = _offered_rate,
      offer_currency = _currency,
      offer_note = _note,
      offer_expires_at = _expires_at,
      offer_sent_at = now(),
      offer_sent_by = auth.uid(),
      reviewed_by = auth.uid()
  WHERE id = _request_id AND status IN ('pending','offer_sent');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already closed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_booking_request(
  _request_id uuid,
  _status text,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_privilege(auth.uid(), 'can_manage_content') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('declined','cancelled','accepted') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.vehicle_booking_requests
  SET status = _status::public.booking_request_status,
      review_note = _note,
      reviewed_by = auth.uid(),
      responded_at = now()
  WHERE id = _request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_respond_to_booking_offer(
  _request_id uuid,
  _accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.vehicle_booking_requests
  SET status = CASE WHEN _accept THEN 'accepted'::public.booking_request_status
                    ELSE 'declined'::public.booking_request_status END,
      responded_at = now()
  WHERE id = _request_id AND driver_id = auth.uid() AND status = 'offer_sent'
    AND (offer_expires_at IS NULL OR offer_expires_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active offer to respond to';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_withdraw_booking_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vehicle_booking_requests
  SET status = 'withdrawn', responded_at = now()
  WHERE id = _request_id AND driver_id = auth.uid() AND status IN ('pending','offer_sent');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open request to withdraw';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_booking_request(uuid, date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_send_booking_offer(uuid, numeric, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_booking_request(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_respond_to_booking_offer(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_withdraw_booking_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_booking_request_column_scope() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_booking_request(uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_booking_offer(uuid, numeric, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_booking_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_respond_to_booking_offer(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_withdraw_booking_request(uuid) TO authenticated;

-- Existing vehicles that were already public-status stay hidden until an admin publishes them.
