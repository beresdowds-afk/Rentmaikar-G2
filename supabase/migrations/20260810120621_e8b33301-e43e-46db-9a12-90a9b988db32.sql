-- 1) Scope support-staff visibility of applications to their assigned city/region
CREATE OR REPLACE FUNCTION public.support_staff_can_view_application(_city text, _region text, _country text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND (
        lower(btrim(coalesce(s.assigned_city, ''))) = lower(btrim(coalesce(_city, '')))
        OR lower(btrim(coalesce(s.assigned_region, ''))) = lower(btrim(coalesce(_region, '')))
        OR lower(btrim(coalesce(s.assigned_region, ''))) = lower(btrim(coalesce(_country, '')))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.support_staff_can_view_application(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_staff_can_view_application(text, text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support staff can view applications" ON public.applications;
CREATE POLICY "Support staff can view assigned-area applications"
ON public.applications
FOR SELECT
TO authenticated
USING (
  public.is_any_support_staff(auth.uid())
  AND public.support_staff_can_view_application(city, region, country)
);

DROP POLICY IF EXISTS "Support staff can update applications" ON public.applications;
CREATE POLICY "Support staff can update assigned-area applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  public.is_any_support_staff(auth.uid())
  AND public.support_staff_can_view_application(city, region, country)
  AND status <> 'approved'::application_status
  AND status <> 'rejected'::application_status
)
WITH CHECK (
  public.is_any_support_staff(auth.uid())
  AND public.support_staff_can_view_application(city, region, country)
  AND status <> 'approved'::application_status
  AND status <> 'rejected'::application_status
);

-- 2) Explicit INSERT policy for admin notifications (service_role already bypasses RLS)
CREATE POLICY "Admins can create notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- 3) Protect role-change tracking fields from self-service profile updates
CREATE OR REPLACE FUNCTION public.profile_privileged_fields_unchanged(_new profiles)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _old public.profiles%ROWTYPE;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT * INTO _old FROM public.profiles WHERE id = _new.id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN _new.user_id IS NOT DISTINCT FROM _old.user_id
     AND _new.access_level IS NOT DISTINCT FROM _old.access_level
     AND _new.persona_verified IS NOT DISTINCT FROM _old.persona_verified
     AND _new.referee_verified IS NOT DISTINCT FROM _old.referee_verified
     AND _new.payment_proxy_verified IS NOT DISTINCT FROM _old.payment_proxy_verified
     AND _new.identity_verified_at IS NOT DISTINCT FROM _old.identity_verified_at
     AND _new.identity_verification_status IS NOT DISTINCT FROM _old.identity_verification_status
     AND _new.identity_verified_inquiry_id IS NOT DISTINCT FROM _old.identity_verified_inquiry_id
     AND _new.email_verified IS NOT DISTINCT FROM _old.email_verified
     AND _new.phone_verified IS NOT DISTINCT FROM _old.phone_verified
     AND _new.registration_stage IS NOT DISTINCT FROM _old.registration_stage
     AND _new.onboarding_completed_at IS NOT DISTINCT FROM _old.onboarding_completed_at
     AND _new.is_active IS NOT DISTINCT FROM _old.is_active
     AND _new.payments_suspended IS NOT DISTINCT FROM _old.payments_suspended
     AND _new.suspended_reason IS NOT DISTINCT FROM _old.suspended_reason
     AND _new.suspended_until IS NOT DISTINCT FROM _old.suspended_until
     AND _new.daily_plan_forbidden IS NOT DISTINCT FROM _old.daily_plan_forbidden
     AND _new.role_change_used IS NOT DISTINCT FROM _old.role_change_used
     AND _new.role_changed_at IS NOT DISTINCT FROM _old.role_changed_at
     AND _new.public_uuid IS NOT DISTINCT FROM _old.public_uuid;
END;
$function$;

-- 4) Strongly type vehicle_analytics_events.vehicle_id and enforce referential integrity
DROP POLICY IF EXISTS "Owners insert analytics for their vehicles" ON public.vehicle_analytics_events;
DROP POLICY IF EXISTS "Owners read analytics for their vehicles" ON public.vehicle_analytics_events;

ALTER TABLE public.vehicle_analytics_events
  ALTER COLUMN vehicle_id TYPE uuid USING NULLIF(btrim(vehicle_id), '')::uuid;

ALTER TABLE public.vehicle_analytics_events
  ALTER COLUMN vehicle_id SET NOT NULL;

ALTER TABLE public.vehicle_analytics_events
  ADD CONSTRAINT vehicle_analytics_events_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vehicle_analytics_events_vehicle_id_idx
  ON public.vehicle_analytics_events (vehicle_id);

CREATE POLICY "Owners read analytics for their vehicles"
ON public.vehicle_analytics_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_analytics_events.vehicle_id
      AND v.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners insert analytics for their vehicles"
ON public.vehicle_analytics_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_analytics_events.vehicle_id
      AND v.owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);