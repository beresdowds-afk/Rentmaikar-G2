-- 1. Curated projection table with identical column types (CTAS from source columns)
CREATE TABLE IF NOT EXISTS public.vehicle_catalogue_listings AS
SELECT id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at
FROM public.vehicles
WHERE false;

ALTER TABLE public.vehicle_catalogue_listings ADD PRIMARY KEY (id);

-- 2. Grants: read-only for public roles, full for service_role (writes happen via security definer trigger only)
GRANT SELECT ON public.vehicle_catalogue_listings TO anon, authenticated;
GRANT ALL ON public.vehicle_catalogue_listings TO service_role;

ALTER TABLE public.vehicle_catalogue_listings ENABLE ROW LEVEL SECURITY;

-- 3. Public read policy: every row in this table is curated public marketing data by construction
CREATE POLICY "Catalogue listings are publicly readable"
ON public.vehicle_catalogue_listings
FOR SELECT
TO anon, authenticated
USING (true);

-- 4. Sync trigger function (security definer so it can write the projection table; runs as owner)
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

DROP TRIGGER IF EXISTS trg_sync_vehicle_catalogue ON public.vehicles;
CREATE TRIGGER trg_sync_vehicle_catalogue
AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_catalogue_listing();

-- 5. Backfill current published vehicles
INSERT INTO public.vehicle_catalogue_listings
  (id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at)
SELECT id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at
FROM public.vehicles
WHERE status IN ('available','active')
  AND is_public = true
  AND photo_urls IS NOT NULL
  AND array_length(photo_urls, 1) >= 1
  AND btrim(coalesce(photo_urls[1], '')) <> ''
ON CONFLICT (id) DO NOTHING;

-- 6. Recreate the catalogue view over the projection table in invoker mode (remediates security-definer-view lint)
CREATE OR REPLACE VIEW public.public_vehicle_listings AS
SELECT id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at
FROM public.vehicle_catalogue_listings;

ALTER VIEW public.public_vehicle_listings SET (security_invoker = true);