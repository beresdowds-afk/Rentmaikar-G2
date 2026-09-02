-- =========================================================
-- 1. LEDGER-ONLY BALANCES
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ledger_balance(
  _user_id uuid,
  _account_type text,
  _currency text,
  _include_pending boolean DEFAULT false
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN e.direction = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)::numeric(14,2)
  FROM public.wallet_ledger_entries e
  JOIN public.wallet_accounts w ON w.id = e.wallet_id
  WHERE e.user_id = _user_id
    AND w.account_type = _account_type
    AND e.currency = _currency
    AND (
      e.status = 'posted'
      OR (_include_pending AND e.status = 'pending')
    );
$$;

REVOKE ALL ON FUNCTION public.get_ledger_balance(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_balance(uuid, text, text, boolean) TO authenticated, service_role;

-- Owner available balance is now derived exclusively from the ledger.
CREATE OR REPLACE FUNCTION public.get_owner_available_balance(
  _owner_id uuid,
  _currency text
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_ledger_balance(_owner_id, 'owner', _currency, false);
$$;

REVOKE ALL ON FUNCTION public.get_owner_available_balance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) TO authenticated, service_role;

-- Ledger-derived summary for the signed-in user (cache-independent).
CREATE OR REPLACE FUNCTION public.get_my_wallet_summary(_currency text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', w.id,
    'account_type', w.account_type,
    'currency', w.currency,
    'available_balance', COALESCE(l.posted, 0),
    'pending_balance', COALESCE(l.pending, 0),
    'lifetime_credits', COALESCE(l.credits, 0),
    'lifetime_debits', COALESCE(l.debits, 0),
    'status', w.status
  )), '[]'::jsonb)
  FROM public.wallet_accounts w
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(CASE WHEN e.status = 'posted'
        THEN CASE WHEN e.direction = 'credit' THEN e.amount ELSE -e.amount END END), 0) AS posted,
      COALESCE(SUM(CASE WHEN e.status = 'pending'
        THEN CASE WHEN e.direction = 'credit' THEN e.amount ELSE -e.amount END END), 0) AS pending,
      COALESCE(SUM(CASE WHEN e.direction = 'credit' AND e.status <> 'reversed' THEN e.amount END), 0) AS credits,
      COALESCE(SUM(CASE WHEN e.direction = 'debit' AND e.status <> 'reversed' THEN e.amount END), 0) AS debits
    FROM public.wallet_ledger_entries e
    WHERE e.wallet_id = w.id
  ) l ON TRUE
  WHERE w.user_id = auth.uid()
    AND (_currency IS NULL OR w.currency = _currency);
$$;

REVOKE ALL ON FUNCTION public.get_my_wallet_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_summary(text) TO authenticated, service_role;

-- =========================================================
-- 2. ADMIN LEDGER RECONCILIATION BY PAYMENT
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_reconcile_payment_ledger(
  _payment_id uuid,
  _owner_share_pct numeric DEFAULT 0.60
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.payments%ROWTYPE;
  entries jsonb;
  posted_driver numeric := 0;
  posted_owner numeric := 0;
  posted_platform numeric := 0;
  expected_owner numeric := 0;
  expected_platform numeric := 0;
  mismatches jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'payment_id', _payment_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'user_id', e.user_id,
      'account_type', w.account_type,
      'direction', e.direction,
      'amount', e.amount,
      'currency', e.currency,
      'entry_type', e.entry_type,
      'status', e.status,
      'provider', e.provider,
      'provider_reference', e.provider_reference,
      'description', e.description,
      'created_at', e.created_at
    ) ORDER BY e.created_at), '[]'::jsonb)
  INTO entries
  FROM public.wallet_ledger_entries e
  JOIN public.wallet_accounts w ON w.id = e.wallet_id
  WHERE e.reference_table = 'payments' AND e.reference_id = _payment_id;

  SELECT
    COALESCE(SUM(CASE WHEN e.entry_type = 'rental_payment' AND e.direction = 'debit' THEN e.amount END), 0),
    COALESCE(SUM(CASE WHEN e.entry_type = 'owner_share' AND e.direction = 'credit' THEN e.amount END), 0),
    COALESCE(SUM(CASE WHEN e.entry_type = 'platform_fee' THEN e.amount END), 0)
  INTO posted_driver, posted_owner, posted_platform
  FROM public.wallet_ledger_entries e
  WHERE e.reference_table = 'payments'
    AND e.reference_id = _payment_id
    AND e.status <> 'reversed';

  expected_owner := ROUND(p.amount * _owner_share_pct, 2);
  expected_platform := ROUND(p.amount - expected_owner, 2);

  IF p.status IN ('completed', 'captured', 'settled', 'available') THEN
    IF posted_driver = 0 THEN
      mismatches := mismatches || jsonb_build_object(
        'code', 'MISSING_DRIVER_DEBIT', 'expected', p.amount, 'posted', posted_driver);
    ELSIF ABS(posted_driver - p.amount) > 0.01 THEN
      mismatches := mismatches || jsonb_build_object(
        'code', 'DRIVER_DEBIT_AMOUNT_MISMATCH', 'expected', p.amount, 'posted', posted_driver);
    END IF;

    IF ABS(posted_owner - expected_owner) > 0.01 THEN
      mismatches := mismatches || jsonb_build_object(
        'code', CASE WHEN posted_owner = 0 THEN 'MISSING_OWNER_SHARE' ELSE 'OWNER_SHARE_MISMATCH' END,
        'expected', expected_owner, 'posted', posted_owner);
    END IF;

    IF ABS(posted_platform - expected_platform) > 0.01 THEN
      mismatches := mismatches || jsonb_build_object(
        'code', CASE WHEN posted_platform = 0 THEN 'MISSING_PLATFORM_FEE' ELSE 'PLATFORM_FEE_MISMATCH' END,
        'expected', expected_platform, 'posted', posted_platform);
    END IF;
  ELSIF jsonb_array_length(entries) > 0 THEN
    mismatches := mismatches || jsonb_build_object(
      'code', 'LEDGER_ENTRIES_ON_UNCAPTURED_PAYMENT', 'expected', 0, 'posted', posted_driver);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'payment', jsonb_build_object(
      'id', p.id, 'amount', p.amount, 'currency', p.currency, 'status', p.status,
      'driver_id', p.driver_id, 'owner_id', p.owner_id, 'rental_id', p.rental_id,
      'transaction_id', p.transaction_id, 'created_at', p.created_at,
      'processed_at', p.processed_at),
    'expected', jsonb_build_object(
      'driver_debit', p.amount, 'owner_share', expected_owner,
      'platform_fee', expected_platform, 'owner_share_pct', _owner_share_pct),
    'posted', jsonb_build_object(
      'driver_debit', posted_driver, 'owner_share', posted_owner, 'platform_fee', posted_platform),
    'entries', entries,
    'mismatches', mismatches,
    'balanced', jsonb_array_length(mismatches) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reconcile_payment_ledger(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_payment_ledger(uuid, numeric) TO authenticated, service_role;

-- Sweep recent payments for ledger mismatches
CREATE OR REPLACE FUNCTION public.admin_scan_ledger_mismatches(
  _since timestamptz DEFAULT (now() - interval '30 days'),
  _limit integer DEFAULT 100,
  _owner_share_pct numeric DEFAULT 0.60
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE rec record; out_rows jsonb := '[]'::jsonb; res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  FOR rec IN
    SELECT id FROM public.payments
    WHERE created_at >= _since
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 500))
  LOOP
    res := public.admin_reconcile_payment_ledger(rec.id, _owner_share_pct);
    IF COALESCE((res->>'balanced')::boolean, true) = false THEN
      out_rows := out_rows || jsonb_build_object(
        'payment', res->'payment',
        'expected', res->'expected',
        'posted', res->'posted',
        'mismatches', res->'mismatches');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned_since', _since, 'mismatches', out_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_scan_ledger_mismatches(timestamptz, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_scan_ledger_mismatches(timestamptz, integer, numeric) TO authenticated, service_role;

-- =========================================================
-- 3. PAYMENT / PAYOUT STATE MACHINE
-- =========================================================
CREATE TABLE public.payment_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('payment','payout')),
  from_state text NOT NULL,
  to_state text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  requires_admin boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity, from_state, to_state)
);

GRANT SELECT ON public.payment_state_transitions TO authenticated;
GRANT ALL ON public.payment_state_transitions TO service_role;
ALTER TABLE public.payment_state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "state map readable by signed-in users"
  ON public.payment_state_transitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage state map"
  ON public.payment_state_transitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.payment_state_transitions (entity, from_state, to_state, is_terminal, requires_admin, description) VALUES
  ('payment','pending','authorized',false,false,'Provider authorized the charge'),
  ('payment','pending','failed',true,false,'Authorization failed'),
  ('payment','pending','pending',false,false,'Retry authorization'),
  ('payment','authorized','captured',false,false,'Funds captured'),
  ('payment','authorized','failed',true,false,'Capture failed'),
  ('payment','authorized','pending',false,false,'Retry after transient failure'),
  ('payment','captured','settled',false,false,'Provider settled the funds'),
  ('payment','captured','refunded',true,false,'Refunded before settlement'),
  ('payment','captured','disputed',false,false,'Chargeback opened'),
  ('payment','settled','available',false,false,'Funds available for payout'),
  ('payment','settled','refunded',true,false,'Refunded after settlement'),
  ('payment','settled','disputed',false,false,'Chargeback opened'),
  ('payment','available','completed',true,false,'Payment lifecycle complete'),
  ('payment','available','refunded',true,false,'Refunded from available balance'),
  ('payment','available','disputed',false,false,'Chargeback opened'),
  ('payment','completed','refunded',true,true,'Admin refund of a completed payment'),
  ('payment','completed','disputed',false,false,'Chargeback opened after completion'),
  ('payment','disputed','completed',true,true,'Dispute resolved in our favour'),
  ('payment','disputed','refunded',true,true,'Dispute resolved for the customer'),
  ('payment','failed','pending',false,false,'Retry a failed payment'),
  ('payout','pending','authorized',false,true,'Withdrawal authorized'),
  ('payout','pending','failed',true,false,'Authorization declined'),
  ('payout','authorized','captured',false,false,'Transfer submitted to provider'),
  ('payout','authorized','failed',true,false,'Transfer submission failed'),
  ('payout','authorized','pending',false,false,'Returned for re-authorization'),
  ('payout','captured','settled',false,false,'Provider confirmed the transfer'),
  ('payout','captured','failed',true,false,'Transfer rejected by provider'),
  ('payout','settled','completed',true,false,'Payout complete'),
  ('payout','settled','refunded',true,false,'Transfer reversed by provider'),
  ('payout','completed','disputed',false,false,'Payout disputed'),
  ('payout','disputed','completed',true,true,'Dispute resolved'),
  ('payout','disputed','refunded',true,true,'Payout reversed after dispute'),
  ('payout','failed','pending',false,false,'Retry a failed payout');

CREATE TABLE public.payment_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL CHECK (entity IN ('payment','payout')),
  entity_id uuid NOT NULL,
  user_id uuid,
  from_state text,
  to_state text NOT NULL,
  reason text,
  actor uuid,
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('system','user','admin','provider','cron')),
  attempt integer NOT NULL DEFAULT 1,
  provider text,
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_state_events_entity ON public.payment_state_events(entity, entity_id, created_at DESC);
CREATE INDEX idx_payment_state_events_user ON public.payment_state_events(user_id, created_at DESC);

GRANT SELECT ON public.payment_state_events TO authenticated;
GRANT ALL ON public.payment_state_events TO service_role;
ALTER TABLE public.payment_state_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own state events"
  ON public.payment_state_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_valid_payment_transition(
  _entity text, _from text, _to text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_state_transitions
    WHERE entity = _entity AND from_state = _from AND to_state = _to
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_payment_transition(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_payment_transition(text, text, text) TO authenticated, service_role;

-- Canonical statuses only; legacy values pass through untouched but are logged.
CREATE OR REPLACE FUNCTION public.enforce_payment_state_machine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _canonical text[] := ARRAY['pending','authorized','captured','settled','available','completed','failed','refunded','disputed'];
  _attempt integer;
  _uid uuid := auth.uid();
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = ANY(_canonical) AND NEW.status = ANY(_canonical) THEN
    IF NOT public.is_valid_payment_transition(_entity, OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid % state transition: % -> %', _entity, OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT COALESCE(MAX(attempt), 0) + 1 INTO _attempt
  FROM public.payment_state_events
  WHERE entity = _entity AND entity_id = NEW.id AND to_state = NEW.status;

  INSERT INTO public.payment_state_events(
    entity, entity_id, user_id, from_state, to_state, actor, actor_kind, attempt, provider, metadata)
  VALUES (
    _entity, NEW.id,
    CASE WHEN _entity = 'payment' THEN NEW.driver_id ELSE NEW.owner_id END,
    OLD.status, NEW.status, _uid,
    CASE
      WHEN _uid IS NULL THEN 'system'
      WHEN public.has_role(_uid, 'admin') THEN 'admin'
      ELSE 'user'
    END,
    _attempt,
    CASE WHEN _entity = 'payout' THEN NEW.provider ELSE NEW.payment_method END,
    jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_payment_state_machine() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_payments_state_machine
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_state_machine('payment');

CREATE TRIGGER trg_owner_payouts_state_machine
  BEFORE UPDATE OF status ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_state_machine('payout');

-- Explicit transition RPC used by edge functions / admin tooling
CREATE OR REPLACE FUNCTION public.transition_payment_state(
  _entity text,
  _entity_id uuid,
  _to_state text,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from text; _requires_admin boolean;
BEGIN
  IF _entity NOT IN ('payment','payout') THEN
    RAISE EXCEPTION 'unknown entity %', _entity;
  END IF;

  IF _entity = 'payment' THEN
    SELECT status INTO _from FROM public.payments WHERE id = _entity_id FOR UPDATE;
  ELSE
    SELECT status INTO _from FROM public.owner_payouts WHERE id = _entity_id FOR UPDATE;
  END IF;

  IF _from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'entity not found');
  END IF;

  IF _from = _to_state THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true, 'state', _from);
  END IF;

  SELECT requires_admin INTO _requires_admin
  FROM public.payment_state_transitions
  WHERE entity = _entity AND from_state = _from AND to_state = _to_state;

  IF _requires_admin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('invalid %s transition: %s -> %s', _entity, _from, _to_state));
  END IF;

  IF _requires_admin AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin role required for this transition');
  END IF;

  IF _entity = 'payment' THEN
    UPDATE public.payments SET status = _to_state, updated_at = now() WHERE id = _entity_id;
  ELSE
    UPDATE public.owner_payouts SET status = _to_state, updated_at = now() WHERE id = _entity_id;
  END IF;

  UPDATE public.payment_state_events
  SET reason = COALESCE(_reason, reason),
      metadata = metadata || COALESCE(_metadata, '{}'::jsonb)
  WHERE id = (
    SELECT id FROM public.payment_state_events
    WHERE entity = _entity AND entity_id = _entity_id
    ORDER BY created_at DESC LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'from', _from, 'to', _to_state);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_payment_state(text, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_payment_state(text, uuid, text, text, jsonb) TO authenticated, service_role;

-- =========================================================
-- 4. WITHDRAWAL DUAL AUTHORIZATION + RISK
-- =========================================================
CREATE TABLE public.withdrawal_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('owner_payout','platform_withdrawal','treasury_transfer')),
  requested_by uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD','NGN')),
  destination_ref text,
  device_fingerprint text,
  ip_address text,
  user_agent text,
  risk_score integer NOT NULL DEFAULT 0,
  risk_flags text[] NOT NULL DEFAULT '{}',
  requires_dual_auth boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','consumed','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  decision_reason text,
  consumed_at timestamptz,
  consumed_reference uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawal_auth_subject ON public.withdrawal_authorizations(subject_user_id, created_at DESC);
CREATE INDEX idx_withdrawal_auth_status ON public.withdrawal_authorizations(status, created_at DESC);

GRANT SELECT ON public.withdrawal_authorizations TO authenticated;
GRANT ALL ON public.withdrawal_authorizations TO service_role;
ALTER TABLE public.withdrawal_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own withdrawal authorizations"
  ON public.withdrawal_authorizations FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid() OR requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_withdrawal_auth_updated_at
  BEFORE UPDATE ON public.withdrawal_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Velocity + device risk scoring
CREATE OR REPLACE FUNCTION public.evaluate_withdrawal_risk(
  _user_id uuid,
  _amount numeric,
  _currency text,
  _device_fingerprint text DEFAULT NULL,
  _request_type text DEFAULT 'owner_payout'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  flags text[] := '{}';
  score integer := 0;
  cnt_1h integer;
  cnt_24h integer;
  sum_24h numeric;
  avg_prior numeric;
  known_device boolean;
  balance numeric;
  big_threshold numeric := CASE WHEN _currency = 'NGN' THEN 2000000 ELSE 2500 END;
BEGIN
  SELECT COUNT(*) INTO cnt_1h FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND created_at > now() - interval '1 hour';
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO cnt_24h, sum_24h
   FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND currency = _currency
     AND created_at > now() - interval '24 hours'
     AND status <> 'rejected';

  IF cnt_1h >= 3 THEN
    flags := flags || 'VELOCITY_HOURLY'; score := score + 30;
  END IF;
  IF cnt_24h >= 5 THEN
    flags := flags || 'VELOCITY_DAILY'; score := score + 25;
  END IF;

  SELECT AVG(amount) INTO avg_prior FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND currency = _currency AND status = 'consumed';
  IF avg_prior IS NOT NULL AND _amount > avg_prior * 3 THEN
    flags := flags || 'AMOUNT_ANOMALY'; score := score + 25;
  END IF;

  IF _amount >= big_threshold THEN
    flags := flags || 'LARGE_AMOUNT'; score := score + 20;
  END IF;

  IF sum_24h + _amount >= big_threshold * 2 THEN
    flags := flags || 'DAILY_TOTAL_HIGH'; score := score + 20;
  END IF;

  IF _device_fingerprint IS NULL OR _device_fingerprint = '' THEN
    flags := flags || 'DEVICE_UNKNOWN'; score := score + 15;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.withdrawal_authorizations
      WHERE subject_user_id = _user_id
        AND device_fingerprint = _device_fingerprint
        AND created_at < now() - interval '10 minutes'
    ) INTO known_device;
    IF NOT known_device THEN
      flags := flags || 'DEVICE_NEW'; score := score + 20;
    END IF;
  END IF;

  IF _request_type = 'owner_payout' THEN
    balance := public.get_ledger_balance(_user_id, 'owner', _currency, false);
    IF balance < _amount THEN
      flags := flags || 'INSUFFICIENT_LEDGER_BALANCE'; score := score + 60;
    END IF;
  END IF;

  IF _request_type IN ('platform_withdrawal','treasury_transfer') THEN
    flags := flags || 'PLATFORM_TREASURY'; score := score + 40;
  END IF;

  RETURN jsonb_build_object(
    'score', LEAST(score, 100),
    'flags', to_jsonb(flags),
    'requires_dual_auth', (score >= 40 OR _request_type <> 'owner_payout'),
    'level', CASE WHEN score >= 60 THEN 'high' WHEN score >= 30 THEN 'medium' ELSE 'low' END,
    'available_balance', balance,
    'window', jsonb_build_object('count_1h', cnt_1h, 'count_24h', cnt_24h, 'sum_24h', sum_24h)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_withdrawal_risk(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_withdrawal_risk(uuid, numeric, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_withdrawal_authorization(
  _request_type text,
  _amount numeric,
  _currency text,
  _subject_user_id uuid DEFAULT NULL,
  _destination_ref text DEFAULT NULL,
  _device_fingerprint text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  subject uuid := COALESCE(_subject_user_id, auth.uid());
  risk jsonb;
  row_id uuid;
  dual boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF _request_type NOT IN ('owner_payout','platform_withdrawal','treasury_transfer') THEN
    RAISE EXCEPTION 'unknown request type %', _request_type;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  IF _request_type = 'owner_payout' THEN
    IF subject <> uid AND NOT public.has_role(uid, 'admin') THEN
      RAISE EXCEPTION 'cannot request a payout for another user';
    END IF;
  ELSE
    IF NOT public.has_role(uid, 'admin') THEN
      RAISE EXCEPTION 'admin role required for platform withdrawals';
    END IF;
  END IF;

  risk := public.evaluate_withdrawal_risk(subject, _amount, _currency, _device_fingerprint, _request_type);
  dual := COALESCE((risk->>'requires_dual_auth')::boolean, true);

  INSERT INTO public.withdrawal_authorizations(
    request_type, requested_by, subject_user_id, amount, currency, destination_ref,
    device_fingerprint, user_agent, risk_score, risk_flags, requires_dual_auth,
    status, metadata)
  VALUES (
    _request_type, uid, subject, _amount, _currency, _destination_ref,
    _device_fingerprint, _user_agent,
    COALESCE((risk->>'score')::integer, 0),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(risk->'flags')), '{}'),
    dual,
    CASE WHEN dual THEN 'pending' ELSE 'approved' END,
    COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('risk', risk))
  RETURNING id INTO row_id;

  IF NOT dual THEN
    UPDATE public.withdrawal_authorizations
      SET approved_at = now(), decision_reason = 'auto-approved: low risk'
      WHERE id = row_id;
  END IF;

  RETURN jsonb_build_object(
    'id', row_id,
    'status', CASE WHEN dual THEN 'pending' ELSE 'approved' END,
    'requires_dual_auth', dual,
    'risk', risk);
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal_authorization(text, numeric, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_authorization(text, numeric, text, uuid, text, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decide_withdrawal_authorization(
  _id uuid,
  _decision text,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rec public.withdrawal_authorizations%ROWTYPE;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;

  SELECT * INTO rec FROM public.withdrawal_authorizations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'authorization request not found'; END IF;
  IF rec.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request is ' || rec.status);
  END IF;
  IF rec.expires_at < now() THEN
    UPDATE public.withdrawal_authorizations SET status = 'expired' WHERE id = _id;
    RETURN jsonb_build_object('ok', false, 'error', 'request expired');
  END IF;
  -- dual authorization: approver must differ from requester and from the beneficiary
  IF _decision = 'approved' AND (uid = rec.requested_by OR uid = rec.subject_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'dual authorization required: a different admin must approve this withdrawal');
  END IF;

  UPDATE public.withdrawal_authorizations
  SET status = _decision, approved_by = uid, approved_at = now(), decision_reason = _reason
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'id', _id, 'status', _decision);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_withdrawal_authorization(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_withdrawal_authorization(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_withdrawal_authorization(
  _id uuid, _reference uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec public.withdrawal_authorizations%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public.withdrawal_authorizations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not found'); END IF;
  IF rec.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'authorization is ' || rec.status);
  END IF;
  IF rec.expires_at < now() THEN
    UPDATE public.withdrawal_authorizations SET status = 'expired' WHERE id = _id;
    RETURN jsonb_build_object('ok', false, 'error', 'authorization expired');
  END IF;
  UPDATE public.withdrawal_authorizations
  SET status = 'consumed', consumed_at = now(), consumed_reference = _reference
  WHERE id = _id;
  RETURN jsonb_build_object('ok', true, 'id', _id);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_withdrawal_authorization(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_withdrawal_authorization(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawal_authorizations(
  _status text DEFAULT NULL, _limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT w.*, p.full_name AS subject_name, p.email AS subject_email
    FROM public.withdrawal_authorizations w
    LEFT JOIN public.profiles p ON p.user_id = w.subject_user_id
    WHERE public.has_role(auth.uid(), 'admin')
      AND (_status IS NULL OR w.status = _status)
    ORDER BY w.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 200))
  ) a;
$$;

REVOKE ALL ON FUNCTION public.admin_list_withdrawal_authorizations(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawal_authorizations(text, integer) TO authenticated, service_role;