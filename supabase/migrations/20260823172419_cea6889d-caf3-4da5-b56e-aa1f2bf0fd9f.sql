DROP POLICY IF EXISTS "Drivers update own pending requests" ON public.vehicle_booking_requests;

CREATE POLICY "Drivers update own pending requests"
ON public.vehicle_booking_requests
FOR UPDATE
USING (
  ((driver_id = auth.uid()) AND (status = 'pending'::booking_request_status))
  OR has_admin_privilege(auth.uid(), 'can_manage_content'::text)
)
WITH CHECK (
  has_admin_privilege(auth.uid(), 'can_manage_content'::text)
  OR (
    (driver_id = auth.uid())
    AND (status = 'pending'::booking_request_status)
    AND EXISTS (
      SELECT 1
      FROM public.vehicle_booking_requests old
      WHERE old.id = vehicle_booking_requests.id
        AND old.offered_rate IS NOT DISTINCT FROM vehicle_booking_requests.offered_rate
        AND old.offer_currency IS NOT DISTINCT FROM vehicle_booking_requests.offer_currency
        AND old.offer_note IS NOT DISTINCT FROM vehicle_booking_requests.offer_note
        AND old.offer_expires_at IS NOT DISTINCT FROM vehicle_booking_requests.offer_expires_at
        AND old.offer_sent_at IS NOT DISTINCT FROM vehicle_booking_requests.offer_sent_at
        AND old.offer_sent_by IS NOT DISTINCT FROM vehicle_booking_requests.offer_sent_by
        AND old.reviewed_by IS NOT DISTINCT FROM vehicle_booking_requests.reviewed_by
        AND old.review_note IS NOT DISTINCT FROM vehicle_booking_requests.review_note
    )
  )
);