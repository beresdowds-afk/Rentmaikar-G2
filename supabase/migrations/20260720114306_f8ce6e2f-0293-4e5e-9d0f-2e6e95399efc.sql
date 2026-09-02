
-- 1. Notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding_stage','access_grant','access_revoke','other')),
  title TEXT NOT NULL,
  body TEXT,
  related_user_id UUID,
  related_stage TEXT,
  related_access_level TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  email_opt_in BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_recipient_created_idx
  ON public.admin_notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_recipient_unread_idx
  ON public.admin_notifications (recipient_id) WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read own notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Recipients update own notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- 2. Fan-out trigger from onboarding_stage_audit
CREATE OR REPLACE FUNCTION public.fanout_admin_onboarding_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_title TEXT;
  v_body TEXT;
  v_user_email TEXT;
BEGIN
  -- Determine kind
  IF NEW.event_type IN ('access_granted','grant_full_access') THEN
    v_kind := 'access_grant';
  ELSIF NEW.event_type IN ('access_revoked','revoke_full_access') THEN
    v_kind := 'access_revoke';
  ELSIF NEW.event_type IN ('stage_advanced','stage_changed') THEN
    v_kind := 'onboarding_stage';
  ELSE
    RETURN NEW;
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = NEW.user_id;

  v_title := CASE v_kind
    WHEN 'access_grant'     THEN 'Full access granted'
    WHEN 'access_revoke'    THEN 'Full access revoked'
    WHEN 'onboarding_stage' THEN 'Onboarding stage advanced'
  END;

  v_body := COALESCE(v_user_email, NEW.user_id::text)
            || CASE v_kind
                 WHEN 'onboarding_stage' THEN ' → ' || COALESCE(NEW.new_stage, '(unknown)')
                 WHEN 'access_grant'     THEN ' now has full dashboard access'
                 WHEN 'access_revoke'    THEN ' had full access revoked'
               END;

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, related_stage, related_access_level, metadata)
  SELECT
    ur.user_id, v_kind, v_title, v_body, NEW.user_id, NEW.new_stage, NEW.new_access_level,
    jsonb_build_object(
      'audit_id', NEW.id,
      'event_type', NEW.event_type,
      'old_stage', NEW.old_stage,
      'new_stage', NEW.new_stage,
      'old_access_level', NEW.old_access_level,
      'new_access_level', NEW.new_access_level,
      'error_class', NEW.error_class
    )
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','admin_assistant');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fanout_admin_onboarding_notification ON public.onboarding_stage_audit;
CREATE TRIGGER trg_fanout_admin_onboarding_notification
AFTER INSERT ON public.onboarding_stage_audit
FOR EACH ROW EXECUTE FUNCTION public.fanout_admin_onboarding_notification();

-- 3. Convenience RPC to mark all read
CREATE OR REPLACE FUNCTION public.mark_all_admin_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.admin_notifications
     SET read_at = now()
   WHERE recipient_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() TO authenticated;
