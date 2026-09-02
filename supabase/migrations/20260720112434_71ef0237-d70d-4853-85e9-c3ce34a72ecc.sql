
-- Onboarding audit timeline: stage changes, RPC outcomes, error classification
CREATE TABLE IF NOT EXISTS public.onboarding_stage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL, -- 'stage_changed' | 'access_changed' | 'rpc_call' | 'rpc_error'
  rpc_name text,
  previous_stage text,
  new_stage text,
  previous_access_level text,
  new_access_level text,
  status text NOT NULL DEFAULT 'ok', -- 'ok' | 'error'
  error_class text,
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onboarding_stage_audit TO authenticated;
GRANT ALL ON public.onboarding_stage_audit TO service_role;

ALTER TABLE public.onboarding_stage_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and assistants read onboarding audit"
  ON public.onboarding_stage_audit FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'admin_assistant')
    OR user_id = auth.uid()
  );

-- No client writes: only SECURITY DEFINER functions insert.
CREATE POLICY "Service role manages onboarding audit"
  ON public.onboarding_stage_audit FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_onboarding_stage_audit_user ON public.onboarding_stage_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_stage_audit_event ON public.onboarding_stage_audit(event_type, created_at DESC);

-- Helper: classify Postgres error text into short categories the UI can filter on.
CREATE OR REPLACE FUNCTION public.classify_onboarding_error(_msg text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _msg IS NULL THEN NULL
    WHEN _msg ILIKE '%not authenticated%' OR _msg ILIKE '%JWT%' THEN 'auth_missing'
    WHEN _msg ILIKE '%permission denied%' OR _msg ILIKE '%only admins%' THEN 'permission_denied'
    WHEN _msg ILIKE '%invalid transition%' OR _msg ILIKE '%cannot advance%' THEN 'invalid_transition'
    WHEN _msg ILIKE '%does not exist%' THEN 'schema_missing'
    WHEN _msg ILIKE '%duplicate%' OR _msg ILIKE '%unique%' THEN 'duplicate'
    WHEN _msg ILIKE '%timeout%' THEN 'timeout'
    ELSE 'other'
  END;
$$;

-- Trigger: log every registration_stage / access_level change on profiles.
CREATE OR REPLACE FUNCTION public.log_profile_stage_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (
    NEW.registration_stage IS DISTINCT FROM OLD.registration_stage
    OR NEW.access_level IS DISTINCT FROM OLD.access_level
  ) THEN
    INSERT INTO public.onboarding_stage_audit(
      user_id, actor_id, event_type,
      previous_stage, new_stage,
      previous_access_level, new_access_level,
      status, details
    ) VALUES (
      NEW.user_id, auth.uid(),
      CASE WHEN NEW.registration_stage IS DISTINCT FROM OLD.registration_stage
           THEN 'stage_changed' ELSE 'access_changed' END,
      OLD.registration_stage::text, NEW.registration_stage::text,
      OLD.access_level::text, NEW.access_level::text,
      'ok', '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_stage_change ON public.profiles;
CREATE TRIGGER trg_log_profile_stage_change
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_profile_stage_change();

-- Public helper any RPC can call to record its outcome + response payload.
CREATE OR REPLACE FUNCTION public.record_onboarding_rpc_event(
  _user_id uuid,
  _rpc_name text,
  _status text,
  _details jsonb DEFAULT '{}'::jsonb,
  _error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.onboarding_stage_audit(
    user_id, actor_id, event_type, rpc_name,
    status, error_class, error_message, details
  ) VALUES (
    _user_id, auth.uid(),
    CASE WHEN _status = 'error' THEN 'rpc_error' ELSE 'rpc_call' END,
    _rpc_name, _status,
    public.classify_onboarding_error(_error_message),
    _error_message, COALESCE(_details, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_onboarding_rpc_event(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_onboarding_rpc_event(uuid, text, text, jsonb, text) TO authenticated;

-- Wrap the existing RPCs so every invocation gets logged with its outcome.
CREATE OR REPLACE FUNCTION public.grant_full_access(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    PERFORM public.record_onboarding_rpc_event(_user_id, 'grant_full_access', 'error',
      jsonb_build_object('target_user_id', _user_id), 'Only admins can grant full access');
    RAISE EXCEPTION 'Only admins can grant full access';
  END IF;

  UPDATE public.profiles
     SET access_level = 'full',
         registration_stage = 'approved',
         stage_updated_at = now(),
         onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
         updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _actor, 'full_access_granted', jsonb_build_object('target_user_id', _user_id)
    FROM public.applications a
   WHERE a.user_id = _user_id
   ORDER BY a.created_at DESC LIMIT 1;

  PERFORM public.record_onboarding_rpc_event(_user_id, 'grant_full_access', 'ok',
    jsonb_build_object('target_user_id', _user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_full_access(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR NOT public.has_role(_actor, 'admin') THEN
    PERFORM public.record_onboarding_rpc_event(_user_id, 'revoke_full_access', 'error',
      jsonb_build_object('target_user_id', _user_id, 'reason', _reason),
      'Only admins can revoke access');
    RAISE EXCEPTION 'Only admins can revoke access';
  END IF;

  UPDATE public.profiles
     SET access_level = 'view_only',
         registration_stage = 'verification_pending',
         stage_updated_at = now(),
         updated_at = now()
   WHERE user_id = _user_id;

  INSERT INTO public.application_audit_log (application_id, actor_id, action, details)
  SELECT a.id, _actor, 'full_access_revoked',
         jsonb_build_object('target_user_id', _user_id, 'reason', _reason)
    FROM public.applications a
   WHERE a.user_id = _user_id
   ORDER BY a.created_at DESC LIMIT 1;

  PERFORM public.record_onboarding_rpc_event(_user_id, 'revoke_full_access', 'ok',
    jsonb_build_object('target_user_id', _user_id, 'reason', _reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_full_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_full_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_full_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_full_access(uuid, text) TO authenticated;
