GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO service_role;

GRANT SELECT ON public.public_vehicle_listings TO anon, authenticated;
GRANT SELECT ON public.public_vehicle_listings TO service_role;

ALTER VIEW public.public_vehicle_listings SET (security_invoker = on);