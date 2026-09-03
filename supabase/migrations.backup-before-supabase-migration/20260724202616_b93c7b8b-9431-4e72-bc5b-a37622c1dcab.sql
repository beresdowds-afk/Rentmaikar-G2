
CREATE OR REPLACE FUNCTION public.enforce_phone_update_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ident TEXT;
  v_count INT;
  v_last  TIMESTAMPTZ;
BEGIN
  -- Only run when the phone value actually changes.
  IF NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
    RETURN NEW;
  END IF;

  v_ident := 'profile-phone:' || NEW.user_id::text;

  -- Flood guard: reject if the phone changed within the last 60 seconds.
  SELECT MAX(window_start) INTO v_last
  FROM public.rate_limit_log
  WHERE identifier = v_ident
    AND endpoint = 'profile_phone_update'
    AND window_start > now() - interval '60 seconds';

  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'phone_update_too_soon: please wait a minute before changing your phone number again'
      USING ERRCODE = '22023';
  END IF;

  -- Hourly cap: max 3 changes per 60 minutes.
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limit_log
  WHERE identifier = v_ident
    AND endpoint = 'profile_phone_update'
    AND window_start > now() - interval '60 minutes';

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'phone_update_rate_limited: too many phone number changes in the last hour'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rate_limit_log (identifier, endpoint, request_count, window_start)
  VALUES (v_ident, 'profile_phone_update', 1, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_phone_update_rate_limit ON public.profiles;
CREATE TRIGGER trg_enforce_phone_update_rate_limit
BEFORE UPDATE OF phone ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_phone_update_rate_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_phone_update_rate_limit() FROM PUBLIC, anon, authenticated;
