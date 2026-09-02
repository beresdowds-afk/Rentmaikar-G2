CREATE OR REPLACE VIEW public.public_vehicle_listings
WITH (security_invoker = true) AS
SELECT id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at
FROM public.vehicles v
WHERE (status = ANY (ARRAY['available'::text,'active'::text]))
  AND is_public = true
  AND photo_urls IS NOT NULL
  AND array_length(photo_urls, 1) >= 1
  AND btrim(coalesce(photo_urls[1], '')) <> '';

GRANT SELECT ON public.public_vehicle_listings TO anon, authenticated;
GRANT SELECT ON public.public_vehicle_listings TO service_role;