
-- 1) Registration stage should never be NULL ------------------------------
ALTER TABLE public.profiles
  ALTER COLUMN registration_stage SET DEFAULT 'auth'::public.registration_stage_enum;

UPDATE public.profiles
   SET registration_stage = 'auth'::public.registration_stage_enum
 WHERE registration_stage IS NULL;

-- 2) Canonical region labels ----------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_country_label(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _v IS NULL OR btrim(_v) = '' THEN NULL
    WHEN upper(btrim(_v)) IN ('US','USA','U.S.','U.S.A.','UNITED STATES','UNITED STATES OF AMERICA') THEN 'USA'
    WHEN upper(btrim(_v)) IN ('NG','NGA','NIGERIA') THEN 'Nigeria'
    ELSE btrim(_v)
  END
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_country_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_country_label(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_profile_country()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.preferred_country := public.normalize_country_label(NEW.preferred_country);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_profile_country_trg ON public.profiles;
CREATE TRIGGER normalize_profile_country_trg
  BEFORE INSERT OR UPDATE OF preferred_country ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_country();

UPDATE public.profiles
   SET preferred_country = public.normalize_country_label(preferred_country)
 WHERE preferred_country IS DISTINCT FROM public.normalize_country_label(preferred_country);
