
-- Restrict anonymous INSERTs on whatsapp tracking tables to service_role only
DROP POLICY IF EXISTS "System can insert whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Service role can insert whatsapp messages"
  ON public.whatsapp_messages FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert delivery records" ON public.whatsapp_message_delivery;
CREATE POLICY "Service role can insert delivery records"
  ON public.whatsapp_message_delivery FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "System can insert template usage" ON public.whatsapp_template_usage;
CREATE POLICY "Service role can insert template usage"
  ON public.whatsapp_template_usage FOR INSERT TO service_role WITH CHECK (true);

-- Restrict api_validation_endpoints SELECT to admins only (contains internal schema/attack-surface info)
DROP POLICY IF EXISTS "Authenticated users can view active API endpoints" ON public.api_validation_endpoints;
CREATE POLICY "Admins can view API endpoints"
  ON public.api_validation_endpoints FOR SELECT TO authenticated
  USING (public.is_admin());
