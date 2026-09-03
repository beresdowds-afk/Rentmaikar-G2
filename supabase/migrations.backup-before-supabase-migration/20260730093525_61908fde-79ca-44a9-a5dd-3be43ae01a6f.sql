-- 1. Failure reason catalogue -------------------------------------------------
CREATE TABLE public.payment_failure_codes (
  code text PRIMARY KEY,
  category text NOT NULL,
  actor text NOT NULL DEFAULT 'all',
  user_message text NOT NULL,
  remediation text,
  retryable boolean NOT NULL DEFAULT false,
  is_blocking boolean NOT NULL DEFAULT true,
  severity text NOT NULL DEFAULT 'error',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_failure_codes TO authenticated;
GRANT ALL ON public.payment_failure_codes TO service_role;
ALTER TABLE public.payment_failure_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "failure codes readable by signed-in users"
  ON public.payment_failure_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage failure codes"
  ON public.payment_failure_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_failure_codes_updated_at
  BEFORE UPDATE ON public.payment_failure_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Pre-flight log ------------------------------------------------------------
CREATE TABLE public.payment_preflight_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  operation text NOT NULL,
  passed boolean NOT NULL,
  blocking_codes text[] NOT NULL DEFAULT '{}',
  warning_codes text[] NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_preflight_log_user ON public.payment_preflight_log(user_id, created_at DESC);
CREATE INDEX idx_payment_preflight_log_op ON public.payment_preflight_log(operation, created_at DESC);

GRANT SELECT ON public.payment_preflight_log TO authenticated;
GRANT ALL ON public.payment_preflight_log TO service_role;
ALTER TABLE public.payment_preflight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own preflight log"
  ON public.payment_preflight_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Idempotency keys ----------------------------------------------------------
CREATE TABLE public.payment_idempotency_keys (
  idempotency_key text PRIMARY KEY,
  scope text NOT NULL,
  user_id uuid,
  request_hash text,
  status text NOT NULL DEFAULT 'in_progress',
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_payment_idem_scope ON public.payment_idempotency_keys(scope, created_at DESC);

GRANT ALL ON public.payment_idempotency_keys TO service_role;
ALTER TABLE public.payment_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read idempotency keys"
  ON public.payment_idempotency_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- claim / complete helpers (service side)
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  _key text, _scope text, _user_id uuid DEFAULT NULL, _request_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.payment_idempotency_keys%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.payment_idempotency_keys WHERE idempotency_key = _key;
  IF FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'status', existing.status, 'response', existing.response);
  END IF;
  INSERT INTO public.payment_idempotency_keys(idempotency_key, scope, user_id, request_hash)
  VALUES (_key, _scope, _user_id, _request_hash)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO existing FROM public.payment_idempotency_keys WHERE idempotency_key = _key;
    RETURN jsonb_build_object('claimed', false, 'status', existing.status, 'response', existing.response);
  END IF;
  RETURN jsonb_build_object('claimed', true, 'status', 'in_progress');
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  _key text, _status text, _response jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.payment_idempotency_keys
  SET status = _status, response = COALESCE(_response, response), completed_at = now()
  WHERE idempotency_key = _key;
$$;

REVOKE ALL ON FUNCTION public.claim_idempotency_key(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_idempotency_key(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_idempotency_key(text, text, jsonb) TO service_role;

-- 4. Pre-flight checker --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_preflight(_operation text, _context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  prof public.profiles%ROWTYPE;
  blockers text[] := '{}';
  warnings text[] := '{}';
  amt numeric := NULLIF(_context->>'amount','')::numeric;
  cur text := COALESCE(NULLIF(_context->>'currency',''), 'USD');
  acct public.owner_payout_accounts%ROWTYPE;
  bal numeric;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'operation', _operation,
      'blockers', jsonb_build_array(jsonb_build_object('code','AUTH_REQUIRED')));
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE user_id = uid;
  IF NOT FOUND THEN
    blockers := blockers || 'PROFILE_MISSING';
  ELSE
    IF prof.is_active IS FALSE THEN blockers := blockers || 'ACCOUNT_DISABLED'; END IF;
    IF prof.payments_suspended IS TRUE THEN blockers := blockers || 'PAYMENTS_SUSPENDED'; END IF;
    IF prof.email_verified IS NOT TRUE THEN blockers := blockers || 'EMAIL_NOT_VERIFIED'; END IF;
    IF prof.phone_verified IS NOT TRUE THEN warnings := warnings || 'PHONE_NOT_VERIFIED'; END IF;
    IF prof.onboarding_completed_at IS NULL THEN warnings := warnings || 'ONBOARDING_INCOMPLETE'; END IF;
    IF prof.identity_verified_at IS NULL THEN
      IF COALESCE(prof.identity_verification_status,'') IN ('pending','submitted','processing') THEN
        blockers := blockers || 'PERSONA_PENDING';
      ELSE
        blockers := blockers || 'PERSONA_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF amt IS NOT NULL AND amt <= 0 THEN blockers := blockers || 'AMOUNT_INVALID'; END IF;
  IF cur NOT IN ('USD','NGN') THEN blockers := blockers || 'CURRENCY_UNSUPPORTED'; END IF;

  IF _operation = 'driver_payment' THEN
    IF NOT public.has_role(uid, 'driver') THEN blockers := blockers || 'ROLE_NOT_DRIVER'; END IF;
    IF amt IS NULL THEN blockers := blockers || 'AMOUNT_MISSING'; END IF;

  ELSIF _operation = 'owner_payout' THEN
    IF NOT public.has_role(uid, 'owner') THEN blockers := blockers || 'ROLE_NOT_OWNER'; END IF;
    SELECT * INTO acct FROM public.owner_payout_accounts
      WHERE owner_id = uid AND currency = cur
      ORDER BY is_default DESC, created_at DESC LIMIT 1;
    IF NOT FOUND THEN
      blockers := blockers || 'PAYOUT_ACCOUNT_MISSING';
    ELSIF acct.is_verified IS NOT TRUE THEN
      blockers := blockers || 'PAYOUT_ACCOUNT_UNVERIFIED';
    END IF;
    bal := public.get_owner_available_balance(uid, cur);
    IF amt IS NULL THEN
      blockers := blockers || 'AMOUNT_MISSING';
    ELSIF bal < amt THEN
      blockers := blockers || 'INSUFFICIENT_AVAILABLE_BALANCE';
    END IF;
    IF EXISTS (SELECT 1 FROM public.owner_payouts
               WHERE owner_id = uid AND status IN ('pending','processing')) THEN
      blockers := blockers || 'PAYOUT_ALREADY_IN_FLIGHT';
    END IF;

  ELSIF _operation = 'admin_withdrawal' THEN
    IF NOT public.has_role(uid, 'admin') THEN blockers := blockers || 'ROLE_NOT_ADMIN'; END IF;
    IF amt IS NULL THEN blockers := blockers || 'AMOUNT_MISSING'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(blockers, 1) IS NULL,
    'operation', _operation,
    'currency', cur,
    'amount', amt,
    'available_balance', bal,
    'blockers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', c, 'message', f.user_message, 'remediation', f.remediation,
        'retryable', COALESCE(f.retryable,false), 'category', f.category))
      FROM unnest(blockers) c LEFT JOIN public.payment_failure_codes f ON f.code = c
    ), '[]'::jsonb),
    'warnings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', c, 'message', f.user_message, 'remediation', f.remediation,
        'category', f.category))
      FROM unnest(warnings) c LEFT JOIN public.payment_failure_codes f ON f.code = c
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payment_preflight(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_preflight(text, jsonb) TO authenticated, service_role;

-- logging wrapper (writes an audit row, then returns the same payload)
CREATE OR REPLACE FUNCTION public.run_payment_preflight(_operation text, _context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  res := public.payment_preflight(_operation, _context);
  INSERT INTO public.payment_preflight_log(user_id, operation, passed, blocking_codes, warning_codes, context)
  VALUES (
    auth.uid(), _operation, COALESCE((res->>'ok')::boolean, false),
    COALESCE(ARRAY(SELECT jsonb_array_elements(res->'blockers')->>'code'), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements(res->'warnings')->>'code'), '{}'),
    _context
  );
  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.run_payment_preflight(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_payment_preflight(text, jsonb) TO authenticated, service_role;