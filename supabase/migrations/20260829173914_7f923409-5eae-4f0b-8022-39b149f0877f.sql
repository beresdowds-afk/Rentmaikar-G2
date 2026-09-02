-- Remove pickup_location visibility for anonymous visitors (column-level grants)
REVOKE SELECT ON public.vehicle_catalogue_listings FROM anon;
GRANT SELECT (id, make, model, year, color, status, pickup_city, photo_urls, created_at)
  ON public.vehicle_catalogue_listings TO anon;

REVOKE SELECT ON public.public_vehicle_listings FROM anon;
GRANT SELECT (id, make, model, year, color, status, pickup_city, photo_urls, created_at)
  ON public.public_vehicle_listings TO anon;
