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
  v_region TEXT;
  v_previous_stage TEXT := NEW.previous_stage;
  v_new_stage TEXT := NEW.new_stage;
  v_previous_access_level TEXT := NEW.previous_access_level;
  v_new_access_level TEXT := NEW.new_access_level;
BEGIN
  IF NEW.event_type IN ('access_granted','grant_full_access') THEN
    v_kind := 'access_grant';
  ELSIF NEW.event_type IN ('access_revoked','revoke_full_access') THEN
    v_kind := 'access_revoke';
  ELSIF NEW.event_type IN ('stage_advanced','stage_changed') THEN
    v_kind := 'onboarding_stage';
  ELSE
    RETURN NEW;
  END IF;

  SELECT email, COALESCE(preferred_country, 'USA')
    INTO v_user_email, v_region
    FROM public.profiles
    WHERE user_id = NEW.user_id;

  v_title := CASE v_kind
    WHEN 'access_grant'     THEN 'Full access granted'
    WHEN 'access_revoke'    THEN 'Full access revoked'
    WHEN 'onboarding_stage' THEN 'Onboarding stage advanced'
  END;

  v_body := COALESCE(v_user_email, NEW.user_id::text)
            || CASE v_kind
                 WHEN 'onboarding_stage' THEN ' → ' || COALESCE(v_new_stage, '(unknown)')
                 WHEN 'access_grant'     THEN ' now has full dashboard access'
                 WHEN 'access_revoke'    THEN ' had full access revoked'
               END;

  INSERT INTO public.admin_notifications
    (recipient_id, kind, title, body, related_user_id, related_stage, related_access_level, metadata)
  SELECT
    ur.user_id,
    v_kind,
    v_title,
    v_body,
    NEW.user_id,
    v_new_stage,
    v_new_access_level,
    jsonb_build_object(
      'audit_id', NEW.id,
      'event_type', NEW.event_type,
      'user_id', NEW.user_id,
      'region', COALESCE(v_region, 'USA'),
      'previous_stage', v_previous_stage,
      'new_stage', v_new_stage,
      'previous_access_level', v_previous_access_level,
      'new_access_level', v_new_access_level,
      'error_class', NEW.error_class
    )
  FROM public.user_roles ur
  WHERE ur.role IN ('admin','admin_assistant');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fanout_admin_onboarding_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fanout_admin_onboarding_notification() TO service_role;