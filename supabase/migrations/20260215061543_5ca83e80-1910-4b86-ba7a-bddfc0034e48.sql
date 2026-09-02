
-- =====================================================
-- SECURITY HARDENING MIGRATION
-- Fixes overly permissive RLS policies and adds
-- explicit anonymous access denial on sensitive tables
-- =====================================================

-- 1. Create admin audit log table for security events
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Only admins can insert audit entries"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.is_admin());

CREATE INDEX idx_admin_audit_log_admin ON public.admin_audit_log(admin_id);
CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

-- 2. Replace overly permissive "true" INSERT policies with service_role-restricted ones
-- These tables are written to by edge functions using the service role key.
-- The service role bypasses RLS anyway, so we can safely restrict these.

-- email_analytics: Replace INSERT true → authenticated admin only (service role bypasses)
DROP POLICY IF EXISTS "Service can insert email analytics" ON public.email_analytics;
CREATE POLICY "Service role inserts email analytics"
  ON public.email_analytics FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_analytics: Replace UPDATE true → admin only
DROP POLICY IF EXISTS "Service can update email analytics" ON public.email_analytics;
CREATE POLICY "Admins can update email analytics"
  ON public.email_analytics FOR UPDATE
  USING (public.is_admin());

-- email_bounces: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert email bounces" ON public.email_bounces;
CREATE POLICY "Service role inserts email bounces"
  ON public.email_bounces FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_clicks: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert email clicks" ON public.email_clicks;
CREATE POLICY "Service role inserts email clicks"
  ON public.email_clicks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_complaints: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert email complaints" ON public.email_complaints;
CREATE POLICY "Service role inserts email complaints"
  ON public.email_complaints FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_logs: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert email logs" ON public.email_logs;
CREATE POLICY "Service role inserts email logs"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_logs: Replace UPDATE true → admin only
DROP POLICY IF EXISTS "Service can update email logs" ON public.email_logs;
CREATE POLICY "Admins can update email logs"
  ON public.email_logs FOR UPDATE
  USING (public.is_admin());

-- email_opens: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert email opens" ON public.email_opens;
CREATE POLICY "Service role inserts email opens"
  ON public.email_opens FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_suppression_list: Replace INSERT true → admin only
DROP POLICY IF EXISTS "Service can insert suppression" ON public.email_suppression_list;
CREATE POLICY "Service role inserts suppression"
  ON public.email_suppression_list FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- email_suppression_list: Replace UPDATE true → admin only
DROP POLICY IF EXISTS "Service can update suppression" ON public.email_suppression_list;
CREATE POLICY "Admins can update suppression"
  ON public.email_suppression_list FOR UPDATE
  USING (public.is_admin());

-- api_key_usage_log: Replace INSERT true → admin only
DROP POLICY IF EXISTS "System can insert usage logs" ON public.api_key_usage_log;
CREATE POLICY "Service role inserts usage logs"
  ON public.api_key_usage_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Create security definer function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action TEXT,
  _target_table TEXT DEFAULT NULL,
  _target_id TEXT DEFAULT NULL,
  _details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can log actions';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), _action, _target_table, _target_id, _details)
  RETURNING id INTO _log_id;

  RETURN _log_id;
END;
$$;

-- 4. Add rate limiting tracking table for API abuse prevention
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- IP or user_id
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view rate limits"
  ON public.rate_limit_log FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Service can insert rate limits"
  ON public.rate_limit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE INDEX idx_rate_limit_identifier ON public.rate_limit_log(identifier, endpoint, window_start);

-- 5. Add session security table for tracking active admin sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all sessions"
  ON public.admin_sessions FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can manage sessions"
  ON public.admin_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX idx_admin_sessions_user ON public.admin_sessions(user_id);
CREATE INDEX idx_admin_sessions_active ON public.admin_sessions(is_active, last_activity DESC);
