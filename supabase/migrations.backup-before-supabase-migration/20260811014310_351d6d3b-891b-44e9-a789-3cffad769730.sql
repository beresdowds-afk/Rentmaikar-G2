CREATE TABLE public.inbox_notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  alert_email TEXT,
  min_priority TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_notification_settings TO authenticated;
GRANT ALL ON public.inbox_notification_settings TO service_role;

ALTER TABLE public.inbox_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own inbox notification settings"
ON public.inbox_notification_settings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view inbox notification settings"
ON public.inbox_notification_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_inbox_notification_settings_updated_at
BEFORE UPDATE ON public.inbox_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_inbox_notification_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.channel NOT IN ('email','sms','whatsapp','facebook_messenger','instagram','linkedin','google_chat','tiktok') THEN
    RAISE EXCEPTION 'Unsupported channel: %', NEW.channel;
  END IF;
  IF NEW.min_priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Unsupported priority: %', NEW.min_priority;
  END IF;
  IF NEW.email_enabled AND NEW.alert_email IS NOT NULL AND NEW.alert_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid alert email address';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_inbox_notification_settings() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_inbox_notification_settings_trg
BEFORE INSERT OR UPDATE ON public.inbox_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_inbox_notification_settings();