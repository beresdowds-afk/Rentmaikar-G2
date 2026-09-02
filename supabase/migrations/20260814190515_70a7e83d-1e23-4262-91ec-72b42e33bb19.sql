DROP TRIGGER IF EXISTS trg_enforce_booking_request_column_scope ON public.vehicle_booking_requests;
CREATE TRIGGER trg_enforce_booking_request_column_scope
BEFORE UPDATE ON public.vehicle_booking_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_request_column_scope();

DROP POLICY IF EXISTS "Drivers update own pending requests" ON public.vehicle_booking_requests;
CREATE POLICY "Drivers update own pending requests"
ON public.vehicle_booking_requests
FOR UPDATE
TO authenticated
USING (
  (driver_id = auth.uid() AND status = 'pending'::booking_request_status)
  OR has_admin_privilege(auth.uid(), 'can_manage_content')
)
WITH CHECK (
  (driver_id = auth.uid() AND status = 'pending'::booking_request_status)
  OR has_admin_privilege(auth.uid(), 'can_manage_content')
);