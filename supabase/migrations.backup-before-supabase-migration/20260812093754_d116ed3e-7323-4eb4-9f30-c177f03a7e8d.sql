ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;

-- Drivers must supply a home address; owners may omit it.
CREATE OR REPLACE FUNCTION public.enforce_driver_address_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.application_type = 'driver'
     AND (NEW.street_address IS NULL OR btrim(NEW.street_address) = '') THEN
    RAISE EXCEPTION 'A home address is required for driver registrations'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_driver_address ON public.applications;
CREATE TRIGGER trg_applications_driver_address
BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_address_required();

-- Registration data flows straight into the user's profile.
CREATE OR REPLACE FUNCTION public.sync_profile_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _country text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  _country := CASE lower(coalesce(NEW.country, ''))
                WHEN 'usa' THEN 'USA'
                WHEN 'nigeria' THEN 'Nigeria'
                ELSE NULL
              END;

  UPDATE public.profiles p
     SET full_name = coalesce(nullif(btrim(p.full_name), ''),
                              btrim(NEW.first_name || ' ' || NEW.last_name)),
         email = coalesce(p.email, NEW.email),
         phone = coalesce(nullif(btrim(p.phone), ''),
                          CASE WHEN NEW.phone_number ~ '^\+[1-9][0-9]{6,14}$'
                                AND NOT EXISTS (
                                      SELECT 1 FROM public.profiles p2
                                       WHERE p2.phone = NEW.phone_number
                                         AND p2.user_id <> NEW.user_id)
                               THEN NEW.phone_number END),
         preferred_country = coalesce(p.preferred_country, _country),
         city = coalesce(nullif(btrim(p.city), ''), NEW.city),
         street_address = coalesce(nullif(btrim(p.street_address), ''), NEW.street_address),
         emergency_contact_name = CASE
           WHEN NEW.application_type = 'driver'
             THEN coalesce(nullif(btrim(p.emergency_contact_name), ''), NEW.referee1_name)
           ELSE p.emergency_contact_name END,
         emergency_contact_phone = CASE
           WHEN NEW.application_type = 'driver'
             THEN coalesce(nullif(btrim(p.emergency_contact_phone), ''),
                           CASE WHEN NEW.referee1_phone ~ '^\+[1-9][0-9]{6,14}$' THEN NEW.referee1_phone END)
           ELSE p.emergency_contact_phone END,
         updated_at = now()
   WHERE p.user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_sync_profile ON public.applications;
CREATE TRIGGER trg_applications_sync_profile
AFTER INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_application();

-- Emergency contact becomes optional so registered users are not forced back
-- through a second sign-up style wizard.
CREATE OR REPLACE FUNCTION public.get_profile_completion_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p record;
  _missing_mandatory text[] := '{}';
  _missing_optional text[] := '{}';
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT phone, preferred_country,
         emergency_contact_name, emergency_contact_phone,
         driver_license_number, driver_license_expiry,
         owns_vehicle, has_payment_method,
         profile_completion_skipped_at
    INTO _p
    FROM public.profiles WHERE user_id = _uid;

  IF _p.phone IS NULL OR btrim(_p.phone) = '' THEN
    _missing_mandatory := array_append(_missing_mandatory, 'phone');
  END IF;
  IF _p.preferred_country IS NULL THEN
    _missing_mandatory := array_append(_missing_mandatory, 'country');
  END IF;

  IF _p.emergency_contact_name IS NULL OR btrim(_p.emergency_contact_name) = ''
     OR _p.emergency_contact_phone IS NULL OR btrim(_p.emergency_contact_phone) = '' THEN
    _missing_optional := array_append(_missing_optional, 'emergency_contact');
  END IF;
  IF _p.driver_license_number IS NULL OR btrim(_p.driver_license_number) = '' THEN
    _missing_optional := array_append(_missing_optional, 'driver_license');
  END IF;
  IF _p.owns_vehicle IS NULL THEN
    _missing_optional := array_append(_missing_optional, 'vehicle_ownership');
  END IF;
  IF _p.has_payment_method IS NOT TRUE THEN
    _missing_optional := array_append(_missing_optional, 'payment_method');
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'missing_mandatory', to_jsonb(_missing_mandatory),
    'missing_optional', to_jsonb(_missing_optional),
    'mandatory_complete', array_length(_missing_mandatory, 1) IS NULL,
    'fully_complete',
      array_length(_missing_mandatory, 1) IS NULL
        AND array_length(_missing_optional, 1) IS NULL,
    'skipped_at', _p.profile_completion_skipped_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_completion_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_completion_status() TO authenticated;

-- Backfill profiles from the most recent application per user.
UPDATE public.profiles p
   SET full_name = coalesce(nullif(btrim(p.full_name), ''), btrim(a.first_name || ' ' || a.last_name)),
       email = coalesce(p.email, a.email),
       phone = coalesce(nullif(btrim(p.phone), ''),
                        CASE WHEN a.phone_number ~ '^\+[1-9][0-9]{6,14}$'
                              AND NOT EXISTS (
                                    SELECT 1 FROM public.profiles p2
                                     WHERE p2.phone = a.phone_number
                                       AND p2.user_id <> p.user_id)
                             THEN a.phone_number END),
       preferred_country = coalesce(p.preferred_country,
         CASE lower(coalesce(a.country,'')) WHEN 'usa' THEN 'USA' WHEN 'nigeria' THEN 'Nigeria' ELSE NULL END),
       city = coalesce(nullif(btrim(p.city), ''), a.city),
       emergency_contact_name = CASE WHEN a.application_type = 'driver'
         THEN coalesce(nullif(btrim(p.emergency_contact_name), ''), a.referee1_name) ELSE p.emergency_contact_name END,
       emergency_contact_phone = CASE WHEN a.application_type = 'driver'
         THEN coalesce(nullif(btrim(p.emergency_contact_phone), ''),
                       CASE WHEN a.referee1_phone ~ '^\+[1-9][0-9]{6,14}$' THEN a.referee1_phone END)
         ELSE p.emergency_contact_phone END
  FROM (
    SELECT DISTINCT ON (user_id) *
      FROM public.applications
     WHERE user_id IS NOT NULL
     ORDER BY user_id, created_at DESC
  ) a
 WHERE a.user_id = p.user_id;