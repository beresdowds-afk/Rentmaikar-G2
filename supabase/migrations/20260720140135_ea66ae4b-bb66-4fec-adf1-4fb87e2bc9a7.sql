-- Enforce name immutability for identity-verified users at the DB layer.
-- Once identity_verification_status = 'approved' (or identity_verified_at is set),
-- profiles.full_name cannot be changed by anyone except service_role.

CREATE OR REPLACE FUNCTION public.enforce_verified_name_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role boolean := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  was_verified boolean := (
    OLD.identity_verification_status = 'approved'
    OR OLD.identity_verified_at IS NOT NULL
  );
BEGIN
  IF is_service_role THEN
    RETURN NEW;
  END IF;

  IF was_verified
     AND NEW.full_name IS DISTINCT FROM OLD.full_name
  THEN
    RAISE EXCEPTION 'Name is locked after identity verification. Contact support to change it.'
      USING ERRCODE = 'check_violation',
            HINT = 'profiles.full_name is immutable once identity_verified_at is set.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verified_name_immutable ON public.profiles;
CREATE TRIGGER trg_enforce_verified_name_immutable
BEFORE UPDATE OF full_name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_verified_name_immutable();

REVOKE EXECUTE ON FUNCTION public.enforce_verified_name_immutable() FROM PUBLIC, anon, authenticated;