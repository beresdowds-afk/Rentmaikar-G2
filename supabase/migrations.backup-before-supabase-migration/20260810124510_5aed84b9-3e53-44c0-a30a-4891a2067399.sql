CREATE OR REPLACE VIEW public.public_vehicle_listings AS
SELECT
  v.id,
  v.make,
  v.model,
  v.year,
  v.color,
  v.status,
  v.pickup_city,
  v.pickup_location,
  v.photo_urls,
  v.created_at
FROM public.vehicles v
WHERE v.status IN ('available', 'active');

ALTER VIEW public.public_vehicle_listings SET (security_barrier = true);

GRANT SELECT ON public.public_vehicle_listings TO anon;
GRANT SELECT ON public.public_vehicle_listings TO authenticated;
GRANT SELECT ON public.public_vehicle_listings TO service_role;