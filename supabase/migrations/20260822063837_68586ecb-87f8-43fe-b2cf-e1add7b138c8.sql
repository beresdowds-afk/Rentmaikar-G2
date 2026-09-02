-- Stop exposing raw vehicle rows (VIN, plate, owner_id) to anonymous visitors.
-- The public catalogue reads public_vehicle_listings, which now runs with the
-- view owner's privileges instead of the caller's, so the raw-table policy is
-- no longer needed.
ALTER VIEW public.public_vehicle_listings SET (security_invoker = off);
GRANT SELECT ON public.public_vehicle_listings TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view available vehicles" ON public.vehicles;