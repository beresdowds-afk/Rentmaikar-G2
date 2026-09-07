-- Mirror every event notification into the user's in-app inbox,
-- except one-time passcode / 2FA verification content.
CREATE OR REPLACE FUNCTION public.notification_is_otp_like(_kind text, _title text, _body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(_kind, '') ~* '(otp|2fa|two[-_ ]?factor|phone_verif|verification_code|security_code)'
    OR COALESCE(_title, '') ~* '(one[- ]?time (pass)?code|verification code|security code|authentication code|login code|your code|2fa|two[- ]factor)'
    OR COALESCE(_body, '') ~* '(one[- ]?time (pass)?code|verification code|security code|authentication code|login code|code[ :#-]{0,3}[0-9]{4,8}|2fa|two[- ]factor)';
$$;

CREATE OR REPLACE FUNCTION public.mirror_notification_to_inbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text := NEW.metadata->>'table';
  v_record text := NEW.metadata->>'record_id';
  v_link text;
BEGIN
  -- Never deliver OTP / 2FA verification codes over the in-app surface.
  IF public.notification_is_otp_like(NEW.kind, NEW.title, NEW.body) THEN
    RETURN NEW;
  END IF;

  IF v_table IS NOT NULL AND v_record IS NOT NULL THEN
    v_link := public.event_deep_link(v_table, v_record, NEW.recipient_id);
  END IF;

  INSERT INTO public.in_app_messages
    (recipient_id, sender_id, sender_name, category, subject, body, link_url, metadata)
  VALUES (
    NEW.recipient_id,
    NULL,
    'Rentmaikar',
    COALESCE(NEW.metadata->>'category', NEW.kind, 'general'),
    NEW.title,
    COALESCE(NULLIF(btrim(NEW.body), ''), NEW.title),
    v_link,
    jsonb_build_object('source', 'event_notification', 'admin_notification_id', NEW.id)
      || COALESCE(NEW.metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_notification_to_inbox() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_is_otp_like(text, text, text) FROM PUBLIC, anon;

-- Prevent duplicate inbox rows if a notification is re-emitted.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_in_app_messages_admin_notification
  ON public.in_app_messages ((metadata->>'admin_notification_id'))
  WHERE metadata ? 'admin_notification_id';

DROP TRIGGER IF EXISTS trg_mirror_notification_to_inbox ON public.admin_notifications;
CREATE TRIGGER trg_mirror_notification_to_inbox
  AFTER INSERT ON public.admin_notifications
  FOR EACH ROW EXECUTE FUNCTION public.mirror_notification_to_inbox();