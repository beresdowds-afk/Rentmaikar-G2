-- 1. Enforce E.164 format at the DB layer for profiles.phone.
--    The `is_valid_e164()` function already exists (see prior migrations).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_e164_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164_chk
  CHECK (phone IS NULL OR public.is_valid_e164(phone))
  NOT VALID;  -- do not backfill-fail existing rows; enforced on all new writes.

-- 2. Persona template: require a driver's license for driver-role inquiries.
ALTER TABLE public.persona_template_config
  ADD COLUMN IF NOT EXISTS requires_drivers_license boolean NOT NULL DEFAULT false;

UPDATE public.persona_template_config
   SET requires_drivers_license = true
 WHERE subject_role = 'driver';
