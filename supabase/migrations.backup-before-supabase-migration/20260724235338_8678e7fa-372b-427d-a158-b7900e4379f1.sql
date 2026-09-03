-- 1. Profile completion columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS driver_license_number text,
  ADD COLUMN IF NOT EXISTS driver_license_expiry date,
  ADD COLUMN IF NOT EXISTS owns_vehicle boolean,
  ADD COLUMN IF NOT EXISTS has_payment_method boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_completion_skipped_at timestamptz;

-- 2. Completion status RPC.
--    Mandatory (required to use marketplace features): phone, preferred_country,
--    emergency contact name + phone.
--    Optional (prompted but skippable): driver license info, vehicle ownership
--    declaration, payment method.
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
  IF _p.emergency_contact_name IS NULL OR btrim(_p.emergency_contact_name) = '' THEN
    _missing_mandatory := array_append(_missing_mandatory, 'emergency_contact_name');
  END IF;
  IF _p.emergency_contact_phone IS NULL OR btrim(_p.emergency_contact_phone) = '' THEN
    _missing_mandatory := array_append(_missing_mandatory, 'emergency_contact_phone');
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