
-- 1. price_negotiations: validate vehicle/owner/driver pairing on INSERT
DROP POLICY IF EXISTS "Drivers can create negotiations" ON public.price_negotiations;
DROP POLICY IF EXISTS "Owners can create negotiations for their vehicles" ON public.price_negotiations;

CREATE POLICY "Drivers can create negotiations"
ON public.price_negotiations
FOR INSERT
TO authenticated
WITH CHECK (
  driver_id = auth.uid()
  AND COALESCE(status::text, 'pending') = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND final_daily_rate IS NULL
  AND COALESCE(is_locked, false) = false
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = price_negotiations.vehicle_id
      AND v.owner_id = price_negotiations.owner_id
  )
);

CREATE POLICY "Owners can create negotiations for their vehicles"
ON public.price_negotiations
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND COALESCE(status::text, 'pending') = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND final_daily_rate IS NULL
  AND COALESCE(is_locked, false) = false
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = price_negotiations.vehicle_id
      AND v.owner_id = auth.uid()
  )
);

-- 2. vehicle_incidents: verify vehicle belongs to owner and there's a rental with the driver
DROP POLICY IF EXISTS "Drivers can create incidents" ON public.vehicle_incidents;

CREATE POLICY "Drivers can create incidents"
ON public.vehicle_incidents
FOR INSERT
TO authenticated
WITH CHECK (
  driver_id = auth.uid()
  AND COALESCE(status::text, 'reported') = 'reported'
  AND resolved_by IS NULL
  AND resolved_at IS NULL
  AND acknowledged_by IS NULL
  AND acknowledged_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_incidents.vehicle_id
      AND v.owner_id = vehicle_incidents.owner_id
  )
  AND EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.vehicle_id = vehicle_incidents.vehicle_id
      AND r.driver_id = auth.uid()
  )
);

-- 3. weekly_inspection_reports: verify active rental for the driver/vehicle/owner triple
DROP POLICY IF EXISTS "Drivers can create own reports" ON public.weekly_inspection_reports;

CREATE POLICY "Drivers can create own reports"
ON public.weekly_inspection_reports
FOR INSERT
TO authenticated
WITH CHECK (
  driver_id = auth.uid()
  AND COALESCE(status, 'pending') = 'pending'
  AND admin_decision IS NULL
  AND admin_notes IS NULL
  AND admin_id IS NULL
  AND admin_reviewed_at IS NULL
  AND owner_action IS NULL
  AND owner_notes IS NULL
  AND owner_reviewed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = weekly_inspection_reports.vehicle_id
      AND v.owner_id = weekly_inspection_reports.owner_id
  )
  AND EXISTS (
    SELECT 1 FROM public.rentals r
    WHERE r.vehicle_id = weekly_inspection_reports.vehicle_id
      AND r.driver_id = auth.uid()
      AND COALESCE(r.status::text, '') IN ('active','pending_return','ongoing','approved')
  )
);

-- 4. Revoke anon EXECUTE from SECURITY DEFINER functions that require an authenticated caller.
-- Keep anon EXECUTE for the public/token-scoped flows only:
--   get_proxy_consent_context(_token) — public consent link
--   submit_proxy_consent(_token,...)  — public consent link
--   update_proxy_notification_prefs(_proxy_id,_prefs,_token) — public consent link
--   no_pending_application_for_email(_email) — pre-signup precheck

REVOKE EXECUTE ON FUNCTION public.has_full_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_full_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_full_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_registration_stage(registration_stage_enum) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_registration_progress() FROM anon, PUBLIC;
