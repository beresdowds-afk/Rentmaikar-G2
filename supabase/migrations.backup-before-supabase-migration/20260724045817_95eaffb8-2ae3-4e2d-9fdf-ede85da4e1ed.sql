
DROP POLICY IF EXISTS "Users can create modification requests" ON public.price_modification_requests;
CREATE POLICY "Users can create modification requests"
ON public.price_modification_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.price_negotiations pn
    WHERE pn.id = price_modification_requests.negotiation_id
      AND (pn.driver_id = auth.uid() OR pn.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Service role inserts analytics" ON public.vehicle_analytics_events;
CREATE POLICY "Owners insert analytics for their vehicles"
ON public.vehicle_analytics_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id::text = vehicle_analytics_events.vehicle_id
      AND v.owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

REVOKE EXECUTE ON FUNCTION public.check_unique_credentials(text, text, text) FROM anon, PUBLIC;
