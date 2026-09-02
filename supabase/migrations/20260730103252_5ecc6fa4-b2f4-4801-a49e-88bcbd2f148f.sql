-- Verification & authentication event log with correlation ids
CREATE TABLE IF NOT EXISTS public.verification_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  correlation_id text NOT NULL,
  stage text NOT NULL,
  step text NOT NULL,
  outcome text NOT NULL,
  provider text,
  failure_code text,
  failure_domain text,
  retryable boolean,
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_event_log_user ON public.verification_event_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_event_log_corr ON public.verification_event_log(correlation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_event_log_code ON public.verification_event_log(failure_code, created_at DESC);

GRANT SELECT ON public.verification_event_log TO authenticated;
GRANT ALL ON public.verification_event_log TO service_role;

ALTER TABLE public.verification_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own verification events" ON public.verification_event_log;
CREATE POLICY "own verification events" ON public.verification_event_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "service role manages verification events" ON public.verification_event_log;
CREATE POLICY "service role manages verification events" ON public.verification_event_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Writer RPC. Callable pre-session (anon) so OAuth failures are captured too.
CREATE OR REPLACE FUNCTION public.log_verification_event(
  p_correlation_id text,
  p_stage text,
  p_step text,
  p_outcome text,
  p_provider text DEFAULT NULL,
  p_failure_code text DEFAULT NULL,
  p_failure_domain text DEFAULT NULL,
  p_retryable boolean DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_recent int;
BEGIN
  IF p_correlation_id IS NULL OR length(p_correlation_id) > 100 THEN
    RETURN NULL;
  END IF;

  -- Cheap flood guard: max 200 events per correlation id per hour.
  SELECT count(*) INTO v_recent
  FROM public.verification_event_log
  WHERE correlation_id = p_correlation_id
    AND created_at > now() - interval '1 hour';
  IF v_recent > 200 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.verification_event_log (
    user_id, correlation_id, stage, step, outcome, provider,
    failure_code, failure_domain, retryable, message, context
  ) VALUES (
    auth.uid(), p_correlation_id, left(p_stage, 40), left(p_step, 120), left(p_outcome, 20),
    left(p_provider, 40), left(p_failure_code, 80), left(p_failure_domain, 60),
    p_retryable, left(p_message, 1000), COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_verification_event(text,text,text,text,text,text,text,boolean,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_verification_event(text,text,text,text,text,text,text,boolean,text,jsonb) TO anon, authenticated, service_role;

-- Journey trace for support/debugging: all events for one correlation id.
CREATE OR REPLACE FUNCTION public.get_verification_trace(p_correlation_id text)
RETURNS SETOF public.verification_event_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.verification_event_log
  WHERE correlation_id = p_correlation_id
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ORDER BY created_at ASC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.get_verification_trace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_verification_trace(text) TO authenticated, service_role;

-- Consolidated activation blockers for the signed-in user.
CREATE OR REPLACE FUNCTION public.get_my_activation_blockers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_blockers jsonb := '[]'::jsonb;
  v_profile record;
  v_role text;
  v_app record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'blockers', '[]'::jsonb);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_uid
    ORDER BY (role::text = 'admin') DESC LIMIT 1;
  SELECT * INTO v_app FROM public.applications WHERE user_id = v_uid
    ORDER BY created_at DESC LIMIT 1;

  IF v_role IS NULL THEN
    v_blockers := v_blockers || jsonb_build_array('missing_role_assignment');
  END IF;

  IF v_profile IS NULL THEN
    v_blockers := v_blockers || jsonb_build_array('profile_creation_failed');
  ELSE
    IF COALESCE(v_profile.identity_verification_status, '') <> 'approved' THEN
      v_blockers := v_blockers || jsonb_build_array('blocker_identity_incomplete');
    END IF;
    IF v_profile.full_name IS NULL OR v_profile.phone IS NULL THEN
      v_blockers := v_blockers || jsonb_build_array('blocker_profile_incomplete');
    END IF;
  END IF;

  IF v_role = 'driver' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_documents d
      WHERE d.user_id = v_uid AND d.document_type = 'drivers_license'
        AND (d.expiry_date IS NULL OR d.expiry_date > current_date)
    ) THEN
      v_blockers := v_blockers || jsonb_build_array('blocker_license_missing');
    END IF;
  END IF;

  IF v_app IS NOT NULL THEN
    IF v_app.status = 'pending' THEN
      v_blockers := v_blockers || jsonb_build_array('blocker_admin_approval_pending');
    ELSIF v_app.status IN ('rejected', 'suspended') THEN
      v_blockers := v_blockers || jsonb_build_array('blocker_account_suspended');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'role', v_role,
    'blockers', v_blockers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_activation_blockers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_activation_blockers() TO authenticated, service_role;