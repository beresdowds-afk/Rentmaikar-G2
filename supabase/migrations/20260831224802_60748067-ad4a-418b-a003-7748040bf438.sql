-- 1) Restrict raw hardware identifiers on device_identities to staff only.
DROP POLICY IF EXISTS "Owner and driver read own device identity" ON public.device_identities;

CREATE OR REPLACE VIEW public.device_identity_status
WITH (security_invoker = true) AS
SELECT
  di.id,
  di.vehicle_id,
  di.rental_id,
  di.driver_id,
  di.owner_id,
  di.status,
  di.bundle_level,
  di.telemetry_provider,
  di.last_synced_at,
  di.verified_at,
  di.created_at,
  di.updated_at
FROM public.device_identities di
WHERE di.driver_id = auth.uid() OR di.owner_id = auth.uid()
   OR has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'iot_support'::app_role);

CREATE POLICY "Owner and driver read own device identity status"
ON public.device_identities
FOR SELECT
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Owner and driver read own device identity status" ON public.device_identities;

GRANT SELECT ON public.device_identity_status TO authenticated;

-- 2) Standardize admin check on rideshare_profile_submissions
DROP POLICY IF EXISTS "Admins can view all profile submissions" ON public.rideshare_profile_submissions;

CREATE POLICY "Admins can view all profile submissions"
ON public.rideshare_profile_submissions
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Drivers can view their own profile submissions" ON public.rideshare_profile_submissions;

CREATE POLICY "Drivers can view their own profile submissions"
ON public.rideshare_profile_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = driver_id);