
-- Tighten UPDATE policies with strict WITH CHECK clauses.
-- Column-scope enforcement triggers (enforce_*_column_scope) already
-- prevent tampering with counterparty/admin fields; these policy changes
-- add defense-in-depth by locking status transitions and admin fields
-- at the RLS layer as well.

-- legal_agreements
DROP POLICY IF EXISTS "Drivers can update their signature" ON public.legal_agreements;
CREATE POLICY "Drivers can update their signature"
ON public.legal_agreements
FOR UPDATE TO authenticated
USING (driver_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'pending_signatures'
);

DROP POLICY IF EXISTS "Owners can update their signature" ON public.legal_agreements;
CREATE POLICY "Owners can update their signature"
ON public.legal_agreements
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (
  owner_id = auth.uid()
  AND status = 'pending_signatures'
);

-- rent_to_own_agreements
DROP POLICY IF EXISTS "Drivers can update their signature" ON public.rent_to_own_agreements;
CREATE POLICY "Drivers can update their signature"
ON public.rent_to_own_agreements
FOR UPDATE TO authenticated
USING (driver_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'pending_signatures'
);

DROP POLICY IF EXISTS "Owners can update their signature" ON public.rent_to_own_agreements;
CREATE POLICY "Owners can update their signature"
ON public.rent_to_own_agreements
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND status = 'pending_signatures')
WITH CHECK (
  owner_id = auth.uid()
  AND status = 'pending_signatures'
);

-- rentals
DROP POLICY IF EXISTS "Drivers can update their active rentals" ON public.rentals;
CREATE POLICY "Drivers can update their active rentals"
ON public.rentals
FOR UPDATE TO authenticated
USING (driver_id = auth.uid() AND status = 'active')
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'active'
);

-- weekly_inspection_reports
DROP POLICY IF EXISTS "Drivers can update pending reports" ON public.weekly_inspection_reports;
CREATE POLICY "Drivers can update pending reports"
ON public.weekly_inspection_reports
FOR UPDATE TO authenticated
USING (driver_id = auth.uid() AND status = 'pending')
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'pending'
  AND admin_decision IS NULL
  AND admin_notes IS NULL
  AND admin_id IS NULL
  AND owner_action IS NULL
  AND owner_notes IS NULL
  AND owner_reviewed_at IS NULL
  AND admin_reviewed_at IS NULL
);
