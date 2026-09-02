ALTER VIEW public.public_vehicle_listings SET (security_invoker = on);

-- Public listing policy: only available/active vehicles are visible to everyone.
DROP POLICY IF EXISTS "Public can view available vehicles" ON public.vehicles;
CREATE POLICY "Public can view available vehicles"
ON public.vehicles
FOR SELECT
TO anon, authenticated
USING (status IN ('available', 'active'));

-- Column-level grants: restrict public reads to non-sensitive catalogue fields only.
REVOKE SELECT ON public.vehicles FROM anon;
GRANT SELECT (id, make, model, year, color, status, pickup_city, pickup_location, photo_urls, created_at)
  ON public.vehicles TO anon;

GRANT SELECT ON public.public_vehicle_listings TO anon;
GRANT SELECT ON public.public_vehicle_listings TO authenticated;