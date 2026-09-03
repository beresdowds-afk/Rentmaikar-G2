
-- 1. Applications: fix tautological duplicate check via SECURITY DEFINER helper
CREATE OR REPLACE FUNCTION public.no_pending_application_for_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.applications
    WHERE email = _email
      AND status IN ('pending'::application_status, 'under_review'::application_status)
  )
$$;

DROP POLICY IF EXISTS "Anyone can submit applications" ON public.applications;
CREATE POLICY "Anyone can submit applications"
ON public.applications
FOR INSERT
TO public
WITH CHECK (public.no_pending_application_for_email(email));

-- 2. messaging_events: restrict inserts to service_role only
DROP POLICY IF EXISTS "Service role can insert messaging events" ON public.messaging_events;
CREATE POLICY "Service role can insert messaging events"
ON public.messaging_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. two_factor_audit_log: restrict inserts to service_role only
DROP POLICY IF EXISTS "System can insert 2FA audit logs" ON public.two_factor_audit_log;
CREATE POLICY "System can insert 2FA audit logs"
ON public.two_factor_audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- 4. unified_message_log: restrict inserts to service_role only
DROP POLICY IF EXISTS "System can insert message logs" ON public.unified_message_log;
CREATE POLICY "System can insert message logs"
ON public.unified_message_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- 5. webhook_deliveries: restrict inserts to service_role only
DROP POLICY IF EXISTS "System can insert webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "System can insert webhook deliveries"
ON public.webhook_deliveries
FOR INSERT
TO service_role
WITH CHECK (true);

-- 6. whatsapp_interactive_flows: restrict insert & update to service_role only
DROP POLICY IF EXISTS "System can insert flows" ON public.whatsapp_interactive_flows;
CREATE POLICY "System can insert flows"
ON public.whatsapp_interactive_flows
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "System can update flows" ON public.whatsapp_interactive_flows;
CREATE POLICY "System can update flows"
ON public.whatsapp_interactive_flows
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- 7. whatsapp_sessions: restrict insert & update to service_role only
DROP POLICY IF EXISTS "System can insert sessions" ON public.whatsapp_sessions;
CREATE POLICY "System can insert sessions"
ON public.whatsapp_sessions
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "System can update sessions" ON public.whatsapp_sessions;
CREATE POLICY "System can update sessions"
ON public.whatsapp_sessions
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);
