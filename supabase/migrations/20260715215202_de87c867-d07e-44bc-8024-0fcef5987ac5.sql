
-- 1) Add WITH CHECK clauses on self-service UPDATE policies to prevent
--    users from writing themselves out of scope or into admin-only fields.
--    Trigger guards already block field-level changes; policy-level
--    WITH CHECK is the additional defense-in-depth the scanner requires.

-- rentals: pin identity + status; block moving row out of "own active"
DROP POLICY IF EXISTS "Drivers can update their active rentals" ON public.rentals;
CREATE POLICY "Drivers can update their active rentals"
ON public.rentals
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid() AND status = 'active')
WITH CHECK (driver_id = auth.uid() AND status = 'active');

-- rent_to_own_listings
DROP POLICY IF EXISTS "Owners can update pending listings" ON public.rent_to_own_listings;
CREATE POLICY "Owners can update pending listings"
ON public.rent_to_own_listings
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid() AND status IN ('pending','counter_offer'))
WITH CHECK (
  owner_id = auth.uid()
  AND status IN ('pending','counter_offer')
  AND approved_by IS NULL
  AND approved_at IS NULL
);

-- user_documents: prevent self-approval
DROP POLICY IF EXISTS "Users can update their own pending documents" ON public.user_documents;
CREATE POLICY "Users can update their own pending documents"
ON public.user_documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND verified_by IS NULL
  AND verified_at IS NULL
  AND rejection_reason IS NULL
);

-- vehicle_incidents: pin identity, block writing resolution/status transitions
DROP POLICY IF EXISTS "Drivers can update their pending incidents" ON public.vehicle_incidents;
CREATE POLICY "Drivers can update their pending incidents"
ON public.vehicle_incidents
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid() AND status = 'reported'::incident_status)
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'reported'::incident_status
  AND resolved_by IS NULL
  AND resolved_at IS NULL
  AND resolution_notes IS NULL
);

-- price_negotiations (driver)
DROP POLICY IF EXISTS "Drivers can update pending negotiations" ON public.price_negotiations;
CREATE POLICY "Drivers can update pending negotiations"
ON public.price_negotiations
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid() AND status = 'pending'::negotiation_status AND is_locked = false)
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'pending'::negotiation_status
  AND is_locked = false
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND final_daily_rate IS NULL
);

-- price_negotiations (owner)
DROP POLICY IF EXISTS "Owners can update pending negotiations" ON public.price_negotiations;
CREATE POLICY "Owners can update pending negotiations"
ON public.price_negotiations
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid() AND status = 'pending'::negotiation_status AND is_locked = false)
WITH CHECK (
  owner_id = auth.uid()
  AND status = 'pending'::negotiation_status
  AND is_locked = false
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND final_daily_rate IS NULL
);

-- rideshare_profile_submissions (driver)
DROP POLICY IF EXISTS "Drivers can update their own pending submissions" ON public.rideshare_profile_submissions;
CREATE POLICY "Drivers can update their own pending submissions"
ON public.rideshare_profile_submissions
FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id AND status = 'pending')
WITH CHECK (
  auth.uid() = driver_id
  AND status = 'pending'
  AND admin_reviewed_by IS NULL
  AND admin_reviewed_at IS NULL
  AND admin_notes IS NULL
);

-- weekly_inspection_reports (owner) — block admin-reserved fields
DROP POLICY IF EXISTS "Owners can update review fields" ON public.weekly_inspection_reports;
CREATE POLICY "Owners can update review fields"
ON public.weekly_inspection_reports
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid() AND status IN ('pending','owner_reviewed'))
WITH CHECK (
  owner_id = auth.uid()
  AND status IN ('pending','owner_reviewed')
  AND admin_decision IS NULL
  AND admin_notes IS NULL
  AND admin_id IS NULL
);

-- 2) SECURITY DEFINER function callable by signed-in users:
--    the testkit trigger-guard runner should never be reachable from
--    the client. Lock it down to service_role only.
REVOKE ALL ON FUNCTION public._testkit_run_trigger_guard_tests(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._testkit_run_trigger_guard_tests(text) TO service_role;

-- log_permission_denied is only invoked from SECURITY DEFINER triggers;
-- signed-in users should not be able to call it directly.
REVOKE ALL ON FUNCTION public.log_permission_denied(text, text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_permission_denied(text, text, text, text[], jsonb) TO service_role;
