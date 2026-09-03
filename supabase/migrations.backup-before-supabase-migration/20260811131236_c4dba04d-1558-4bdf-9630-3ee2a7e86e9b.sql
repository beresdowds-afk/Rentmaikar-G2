CREATE OR REPLACE FUNCTION public.get_reply_placeholder_values(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.inbox_conversations%ROWTYPE;
  prof public.profiles%ROWTYPE;
  rent public.rentals%ROWTYPE;
  veh public.vehicles%ROWTYPE;
  br public.vehicle_booking_requests%ROWTYPE;
  full_name text;
  start_d date;
  end_d date;
  result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'admin_assistant'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO conv FROM public.inbox_conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  IF conv.user_id IS NOT NULL THEN
    SELECT * INTO prof FROM public.profiles WHERE id = conv.user_id;

    SELECT * INTO rent
    FROM public.rentals
    WHERE driver_id = conv.user_id
    ORDER BY (status = 'active') DESC, start_date DESC
    LIMIT 1;

    IF rent.id IS NOT NULL THEN
      SELECT * INTO veh FROM public.vehicles WHERE id = rent.vehicle_id;
      start_d := rent.start_date;
      end_d := COALESCE(rent.extended_end_date, rent.end_date);
    ELSE
      SELECT * INTO br
      FROM public.vehicle_booking_requests
      WHERE driver_id = conv.user_id
      ORDER BY created_at DESC
      LIMIT 1;

      IF br.id IS NOT NULL THEN
        SELECT * INTO veh FROM public.vehicles WHERE id = br.vehicle_id;
        start_d := br.start_date;
        end_d := br.end_date;
      END IF;
    END IF;
  END IF;

  full_name := COALESCE(NULLIF(TRIM(prof.full_name), ''), NULLIF(TRIM(conv.user_name), ''));

  result := jsonb_build_object(
    'customer_name', COALESCE(full_name, 'there'),
    'first_name', COALESCE(split_part(full_name, ' ', 1), 'there'),
    'customer_email', COALESCE(prof.email, conv.user_email, ''),
    'customer_phone', COALESCE(prof.phone, conv.user_phone, ''),
    'region', COALESCE(conv.region, prof.preferred_country, ''),
    'vehicle', COALESCE(NULLIF(TRIM(CONCAT_WS(' ', veh.year::text, veh.make, veh.model)), ''), ''),
    'vehicle_plate', COALESCE(veh.license_plate, ''),
    'pickup_location', COALESCE(rent.pickup_location, veh.pickup_location, veh.pickup_address, ''),
    'booking_start', COALESCE(TO_CHAR(start_d, 'DD Mon YYYY'), ''),
    'booking_end', COALESCE(TO_CHAR(end_d, 'DD Mon YYYY'), ''),
    'daily_rate', COALESCE(rent.daily_rate::text, br.offered_rate::text, ''),
    'currency', COALESCE(rent.currency, br.offer_currency, ''),
    'payment_frequency', COALESCE(rent.payment_frequency, ''),
    'today', TO_CHAR(now(), 'DD Mon YYYY')
  );

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_reply_placeholder_values(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reply_placeholder_values(uuid) TO authenticated, service_role;