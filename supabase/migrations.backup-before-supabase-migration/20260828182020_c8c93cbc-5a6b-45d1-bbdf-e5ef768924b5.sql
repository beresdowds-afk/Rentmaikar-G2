CREATE OR REPLACE FUNCTION public.validate_application_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm_email text;
  v_recent_hour int;
  v_recent_day int;
BEGIN
  v_norm_email := lower(btrim(NEW.email));
  IF v_norm_email !~ '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
     OR length(v_norm_email) > 254 THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
  END IF;
  NEW.email := v_norm_email;

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

  IF NEW.phone_number IS NULL
     OR length(regexp_replace(NEW.phone_number, '[^0-9]', '', 'g')) < 6
     OR length(NEW.phone_number) > 32 THEN
    RAISE EXCEPTION 'Invalid phone number' USING ERRCODE = '22023';
  END IF;
  IF length(NEW.phone_country) > 8 THEN
    RAISE EXCEPTION 'Invalid phone country code' USING ERRCODE = '22023';
  END IF;

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

  IF NOT (NEW.agreed_terms AND NEW.agreed_privacy AND NEW.agreed_iot) THEN
    RAISE EXCEPTION 'All required consents must be accepted' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_admin() THEN
    NEW.status                := 'approved';
    NEW.reviewed_by           := NULL;
    NEW.reviewed_at           := now();
    NEW.review_notes          := 'Auto-approved on submission';
    NEW.rejection_reason      := NULL;
    NEW.assigned_to           := NULL;
    NEW.assigned_at           := NULL;
    NEW.assigned_by           := NULL;
    IF auth.uid() IS NULL THEN
      NEW.user_id := NULL;
    ELSE
      NEW.user_id := auth.uid();
    END IF;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.auto_provision_on_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
  v_user uuid := NEW.user_id;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF v_user IS NULL AND NEW.email IS NOT NULL THEN
    SELECT p.user_id INTO v_user FROM public.profiles p
     WHERE lower(p.email) = lower(NEW.email)
     ORDER BY p.created_at LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := CASE NEW.application_type::text
    WHEN 'driver' THEN 'driver'::app_role
    WHEN 'owner'  THEN 'owner'::app_role
    ELSE NULL END;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user) THEN
    INSERT INTO public.profiles (user_id, email, street_address)
    VALUES (v_user, NEW.email, NEW.street_address);
  END IF;

  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.two_factor_settings (user_id, is_enabled, is_mandatory, preferred_channel)
  VALUES (v_user, false, false, 'sms')
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.profiles
     SET registration_stage = 'approved',
         access_level = 'full',
         stage_updated_at = now(),
         updated_at = now()
   WHERE user_id = v_user;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_provision_on_application ON public.applications;
CREATE TRIGGER trg_auto_provision_on_application
AFTER INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.auto_provision_on_application();

CREATE OR REPLACE FUNCTION public.advance_registration_stage(_target registration_stage_enum)
RETURNS registration_stage_enum
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _current public.registration_stage_enum;
  _order int;
  _target_order int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT registration_stage INTO _current FROM public.profiles WHERE user_id = _uid;
  IF _current IS NULL THEN _current := 'auth'; END IF;

  _order := array_position(ARRAY['auth','account_opened','documents_submitted','verification_pending','approved']::text[], _current::text);
  _target_order := array_position(ARRAY['auth','account_opened','documents_submitted','verification_pending','approved']::text[], _target::text);

  IF _target_order < _order THEN
    RETURN _current;
  END IF;

  UPDATE public.profiles
     SET registration_stage = _target,
         access_level = CASE WHEN _target = 'approved' THEN 'full'::public.access_level_enum ELSE access_level END,
         stage_updated_at = now(),
         updated_at = now()
   WHERE user_id = _uid;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _uid, 'stage_advanced',
         jsonb_build_object('from', _current, 'to', _target)
    FROM public.applications a
   WHERE a.user_id = _uid
   ORDER BY a.created_at DESC
   LIMIT 1;

  RETURN _target;
END;
$function$;

ALTER TABLE public.applications DISABLE TRIGGER trg_applications_driver_address;
UPDATE public.applications
   SET status = 'approved',
       reviewed_at = COALESCE(reviewed_at, now()),
       review_notes = COALESCE(review_notes, 'Auto-approved (approval gate removed)'),
       updated_at = now()
 WHERE status IN ('pending','under_review','needs_info');
ALTER TABLE public.applications ENABLE TRIGGER trg_applications_driver_address;

CREATE OR REPLACE FUNCTION public.enforce_vehicle_pickup_before_listing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_pickup boolean;
  v_has_photo boolean;
BEGIN
  v_has_pickup :=
    nullif(btrim(coalesce(NEW.pickup_city, '')), '') IS NOT NULL
    AND nullif(btrim(coalesce(NEW.pickup_address, '')), '') IS NOT NULL;

  v_has_photo :=
    NEW.photo_urls IS NOT NULL
    AND array_length(NEW.photo_urls, 1) >= 1
    AND btrim(coalesce(NEW.photo_urls[1], '')) <> '';

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND auth.uid() = NEW.owner_id
     AND NOT v_has_pickup THEN
    RAISE EXCEPTION 'Set the vehicle pickup city and street address before submitting vehicle credentials and photos.';
  END IF;

  IF v_has_photo AND NOT v_has_pickup THEN
    RAISE EXCEPTION 'Add the vehicle pickup city and street address before uploading or publishing vehicle photos.';
  END IF;

  IF NEW.review_status = 'rejected'
     OR (TG_OP = 'UPDATE' AND OLD.is_public = true AND NEW.is_public = false) THEN
    RETURN NEW;
  END IF;

  IF v_has_pickup AND v_has_photo THEN
    NEW.review_status := 'approved';
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.is_public := true;
    NEW.published_at := COALESCE(NEW.published_at, now());
    IF NEW.status IS NULL OR NEW.status = 'pending' THEN
      NEW.status := 'available';
    END IF;
  ELSE
    NEW.is_public := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vehicles_require_pickup_on_owner_insert ON public.vehicles;
DROP TRIGGER IF EXISTS trg_z_vehicles_pickup_autopublish ON public.vehicles;
CREATE TRIGGER trg_z_vehicles_pickup_autopublish
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_pickup_before_listing();

UPDATE public.vehicles
   SET review_status = 'approved',
       reviewed_at = COALESCE(reviewed_at, now()),
       is_public = true,
       published_at = COALESCE(published_at, now()),
       status = CASE WHEN status = 'pending' THEN 'available' ELSE status END,
       updated_at = now()
 WHERE COALESCE(review_status, '') <> 'rejected'
   AND nullif(btrim(coalesce(pickup_city, '')), '') IS NOT NULL
   AND nullif(btrim(coalesce(pickup_address, '')), '') IS NOT NULL
   AND photo_urls IS NOT NULL
   AND array_length(photo_urls, 1) >= 1
   AND btrim(coalesce(photo_urls[1], '')) <> '';