CREATE OR REPLACE FUNCTION public.enforce_driver_address_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.street_address := nullif(btrim(coalesce(NEW.street_address, '')), '');

  IF NEW.application_type = 'driver' THEN
    IF NEW.street_address IS NULL THEN
      RAISE EXCEPTION 'A home address is required for driver registrations'
        USING ERRCODE = '23514';
    END IF;
    IF length(NEW.street_address) < 5 THEN
      RAISE EXCEPTION 'Home address must be at least 5 characters'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.street_address IS NOT NULL AND length(NEW.street_address) > 200 THEN
    RAISE EXCEPTION 'Home address must be 200 characters or fewer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;