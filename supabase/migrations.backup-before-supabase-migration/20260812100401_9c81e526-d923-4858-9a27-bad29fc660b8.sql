CREATE OR REPLACE FUNCTION public.enforce_profile_address_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_driver boolean;
  _changed boolean;
BEGIN
  NEW.street_address := nullif(btrim(coalesce(NEW.street_address, '')), '');

  IF NEW.street_address IS NOT NULL AND length(NEW.street_address) > 200 THEN
    RAISE EXCEPTION 'Home address must be 200 characters or fewer'
      USING ERRCODE = '23514';
  END IF;

  _changed := TG_OP = 'INSERT'
    OR NEW.street_address IS DISTINCT FROM nullif(btrim(coalesce(OLD.street_address, '')), '');

  IF NOT _changed THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = NEW.user_id AND ur.role = 'driver'::app_role
  ) INTO _is_driver;

  IF _is_driver THEN
    IF NEW.street_address IS NULL THEN
      RAISE EXCEPTION 'A home address is required for drivers'
        USING ERRCODE = '23514';
    END IF;
    IF length(NEW.street_address) < 5 THEN
      RAISE EXCEPTION 'Home address must be at least 5 characters'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_profile_address_rules ON public.profiles;
CREATE TRIGGER trg_enforce_profile_address_rules
BEFORE INSERT OR UPDATE OF street_address ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_address_rules();

REVOKE ALL ON FUNCTION public.enforce_profile_address_rules() FROM PUBLIC, anon, authenticated;