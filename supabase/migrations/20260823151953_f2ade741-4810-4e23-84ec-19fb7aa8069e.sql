-- Tighten public read on the curated catalogue projection table
DROP POLICY IF EXISTS "Catalogue listings are publicly readable" ON public.vehicle_catalogue_listings;

CREATE POLICY "Public can read available catalogue listings"
  ON public.vehicle_catalogue_listings FOR SELECT TO anon, authenticated
  USING (
    status = 'available'
    AND photo_urls IS NOT NULL
    AND array_length(photo_urls, 1) > 0
  );

CREATE POLICY "Admins can read all catalogue listings"
  ON public.vehicle_catalogue_listings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));