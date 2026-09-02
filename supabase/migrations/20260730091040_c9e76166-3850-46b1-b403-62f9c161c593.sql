-- =====================================================================
-- 1. applications: server-side validation + anti-spam throttle
-- =====================================================================

CREATE OR REPLACE FUNCTION public.validate_application_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm_email text;
  v_recent_hour int;
  v_recent_day int;
BEGIN
  -- ---- normalize + validate email -----------------------------------
  v_norm_email := lower(btrim(NEW.email));
  IF v_norm_email !~ '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
     OR length(v_norm_email) > 254 THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
  END IF;
  NEW.email := v_norm_email;

  -- ---- names / location ---------------------------------------------
  NEW.first_name := btrim(NEW.first_name);
  NEW.last_name  := btrim(NEW.last_name);
  IF length(NEW.first_name) < 1 OR length(NEW.first_name) > 80
     OR length(NEW.last_name) < 1 OR length(NEW.last_name) > 80 THEN
    RAISE EXCEPTION 'Name must be between 1 and 80 characters' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(NEW.city)) < 1 OR length(NEW.city) > 120
     OR length(btrim(NEW.country)) < 1 OR length(NEW.country) > 80
     OR length(NEW.zip_code) > 20
     OR length(NEW.region) > 120 THEN
    RAISE EXCEPTION 'Invalid location details' USING ERRCODE = '22023';
  END IF;

  -- ---- phone ----------------------------------------------------------
  IF NEW.phone_number IS NULL
     OR length(regexp_replace(NEW.phone_number, '[^0-9]', '', 'g')) < 6
     OR length(NEW.phone_number) > 32 THEN
    RAISE EXCEPTION 'Invalid phone number' USING ERRCODE = '22023';
  END IF;
  IF length(NEW.phone_country) > 8 THEN
    RAISE EXCEPTION 'Invalid phone country code' USING ERRCODE = '22023';
  END IF;

  -- ---- referees (optional, but bounded when supplied) -----------------
  IF length(coalesce(NEW.referee1_name, '')) > 120
     OR length(coalesce(NEW.referee2_name, '')) > 120
     OR length(coalesce(NEW.referee3_name, '')) > 120
     OR length(coalesce(NEW.referee1_address, '')) > 300
     OR length(coalesce(NEW.referee2_address, '')) > 300
     OR length(coalesce(NEW.referee3_address, '')) > 300
     OR length(coalesce(NEW.referee1_phone, '')) > 32
     OR length(coalesce(NEW.referee2_phone, '')) > 32
     OR length(coalesce(NEW.referee3_phone, '')) > 32 THEN
    RAISE EXCEPTION 'Referee details exceed allowed length' USING ERRCODE = '22023';
  END IF;

  -- ---- vehicle --------------------------------------------------------
  IF NEW.vehicle_year IS NOT NULL
     AND (NEW.vehicle_year < 1950
          OR NEW.vehicle_year > (extract(year FROM now())::int + 2)) THEN
    RAISE EXCEPTION 'Invalid vehicle year' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(NEW.vehicle_make, '')) > 60
     OR length(coalesce(NEW.vehicle_model, '')) > 60
     OR length(coalesce(NEW.vehicle_color, '')) > 40
     OR length(coalesce(NEW.vehicle_plate, '')) > 20
     OR length(coalesce(NEW.vehicle_description, '')) > 2000 THEN
    RAISE EXCEPTION 'Vehicle details exceed allowed length' USING ERRCODE = '22023';
  END IF;
  IF NEW.desired_weekly_price IS NOT NULL
     AND (NEW.desired_weekly_price < 0 OR NEW.desired_weekly_price > 100000000) THEN
    RAISE EXCEPTION 'Invalid desired weekly price' USING ERRCODE = '22023';
  END IF;

  -- ---- consent --------------------------------------------------------
  IF NOT (NEW.agreed_terms AND NEW.agreed_privacy AND NEW.agreed_iot) THEN
    RAISE EXCEPTION 'All required consents must be accepted' USING ERRCODE = '22023';
  END IF;

  -- ---- privilege fields cannot be set by the submitter ----------------
  IF NOT public.is_admin() THEN
    NEW.status                := 'pending';
    NEW.reviewed_by           := NULL;
    NEW.reviewed_at           := NULL;
    NEW.review_notes          := NULL;
    NEW.rejection_reason      := NULL;
    NEW.assigned_to           := NULL;
    NEW.assigned_at           := NULL;
    NEW.assigned_by           := NULL;
    -- never let a submission be attached to somebody else's account
    IF auth.uid() IS NULL THEN
      NEW.user_id := NULL;
    ELSE
      NEW.user_id := auth.uid();
    END IF;
  END IF;

  -- ---- throttle: cap submissions per email ---------------------------
  IF NOT public.is_admin() THEN
    SELECT count(*) INTO v_recent_hour
    FROM public.applications
    WHERE email = v_norm_email AND created_at > now() - interval '1 hour';

    IF v_recent_hour >= 3 THEN
      RAISE EXCEPTION 'Too many applications submitted recently. Please try again later.'
        USING ERRCODE = '53400';
    END IF;

    SELECT count(*) INTO v_recent_day
    FROM public.applications
    WHERE email = v_norm_email AND created_at > now() - interval '24 hours';

    IF v_recent_day >= 10 THEN
      RAISE EXCEPTION 'Daily application limit reached for this email address.'
        USING ERRCODE = '53400';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_application_submission() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_validate_application_submission ON public.applications;
CREATE TRIGGER trg_validate_application_submission
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.validate_application_submission();

CREATE INDEX IF NOT EXISTS idx_applications_email_created_at
  ON public.applications (email, created_at DESC);

-- =====================================================================
-- 2. email tracking / rate-limit logs: backend-only writes
-- =====================================================================

DROP POLICY IF EXISTS "Service role inserts email logs"       ON public.email_logs;
DROP POLICY IF EXISTS "Service role inserts email opens"      ON public.email_opens;
DROP POLICY IF EXISTS "Service role inserts email clicks"     ON public.email_clicks;
DROP POLICY IF EXISTS "Service role inserts email bounces"    ON public.email_bounces;
DROP POLICY IF EXISTS "Service role inserts email complaints" ON public.email_complaints;
DROP POLICY IF EXISTS "Service role inserts email analytics"  ON public.email_analytics;
DROP POLICY IF EXISTS "Service role inserts suppression"      ON public.email_suppression_list;
DROP POLICY IF EXISTS "Service can insert rate limits"        ON public.rate_limit_log;
DROP POLICY IF EXISTS "Service role inserts usage logs"       ON public.api_key_usage_log;

REVOKE INSERT, UPDATE, DELETE ON public.email_logs             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_opens            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_clicks           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_bounces          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_complaints       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_analytics        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_suppression_list FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limit_log         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.api_key_usage_log      FROM anon, authenticated;

REVOKE ALL ON public.rate_limit_log    FROM anon;
REVOKE ALL ON public.api_key_usage_log FROM anon;

GRANT ALL ON public.email_logs             TO service_role;
GRANT ALL ON public.email_opens            TO service_role;
GRANT ALL ON public.email_clicks           TO service_role;
GRANT ALL ON public.email_bounces          TO service_role;
GRANT ALL ON public.email_complaints       TO service_role;
GRANT ALL ON public.email_analytics        TO service_role;
GRANT ALL ON public.email_suppression_list TO service_role;
GRANT ALL ON public.rate_limit_log         TO service_role;
GRANT ALL ON public.api_key_usage_log      TO service_role;