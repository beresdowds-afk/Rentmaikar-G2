-- 1. Fix permission key typo on sms_consent_records
DROP POLICY IF EXISTS "Users can view their own SMS consent records" ON public.sms_consent_records;
CREATE POLICY "Users can view their own SMS consent records"
  ON public.sms_consent_records FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_admin_privilege(auth.uid(), 'can_view_communications'));

-- 2. Only approved vehicles may reach the public catalogue projection
CREATE OR REPLACE FUNCTION public.sync_vehicle_catalogue_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.vehicle_catalogue_listings WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status IN ('available','active')
     AND NEW.is_public = true
     AND coalesce(NEW.review_status, '') = 'approved'
     AND NEW.reviewed_at IS NOT NULL
     AND NEW.photo_urls IS NOT NULL
     AND array_length(NEW.photo_urls, 1) >= 1
     AND btrim(coalesce(NEW.photo_urls[1], '')) <> '' THEN
    INSERT INTO public.vehicle_catalogue_listings AS cl
      (id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at)
    VALUES
      (NEW.id, NEW.make, NEW.model, NEW.year, NEW.color, NEW.status, NEW.pickup_city, NEW.pickup_location, NEW.photo_urls, NEW.created_at)
    ON CONFLICT (id) DO UPDATE SET
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year,
      color = EXCLUDED.color,
      status = EXCLUDED.status,
      pickup_city = EXCLUDED.pickup_city,
      pickup_location = EXCLUDED.pickup_location,
      photo_urls = EXCLUDED.photo_urls,
      created_at = EXCLUDED.created_at;
  ELSE
    DELETE FROM public.vehicle_catalogue_listings WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Purge any currently-listed vehicles that are not approved
DELETE FROM public.vehicle_catalogue_listings cl
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicles v
  WHERE v.id = cl.id
    AND v.is_public = true
    AND v.status IN ('available','active')
    AND coalesce(v.review_status, '') = 'approved'
    AND v.reviewed_at IS NOT NULL
    AND v.photo_urls IS NOT NULL
    AND array_length(v.photo_urls, 1) >= 1
    AND btrim(coalesce(v.photo_urls[1], '')) <> ''
);
