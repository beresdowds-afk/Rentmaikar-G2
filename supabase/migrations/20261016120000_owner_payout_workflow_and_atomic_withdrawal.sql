-- Owner payout workflow separation, atomic withdrawal authorization and
-- settlement/reconciliation functions.
--
-- Backward compatible: only adds nullable/defaulted columns, partial unique
-- indexes (created only when existing data has no conflicts), new functions,
-- and tightens the owner INSERT RLS policy so payouts can only be created
-- through the server-side withdrawal functions below.
--
-- Rollback notes: columns/indexes/functions are additive and may be dropped
-- individually. The owner INSERT policy previously allowed any authenticated
-- owner to insert their own payout row directly (bypassing authorization); it
-- is intentionally replaced by an admin-only policy.

-- 1. Durable workflow classification + traceability columns -----------------
ALTER TABLE public.owner_payouts
  ADD COLUMN IF NOT EXISTS workflow_type text NOT NULL DEFAULT 'self_withdrawal',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS weekly_approved_by uuid,
  ADD COLUMN IF NOT EXISTS weekly_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_reason text;

ALTER TABLE public.owner_payouts
  DROP CONSTRAINT IF EXISTS owner_payouts_workflow_type_check;
ALTER TABLE public.owner_payouts
  ADD CONSTRAINT owner_payouts_workflow_type_check
  CHECK (workflow_type IN ('self_withdrawal', 'weekly_bulk'));

-- Historical classification. Rows created by the scheduler are weekly payouts;
-- everything else stays self_withdrawal (the safe default: the weekly worker
-- never selects it). weekly_approved_at stays NULL so no historical row becomes
-- eligible for the weekly worker without an explicit admin approval.
UPDATE public.owner_payouts
SET workflow_type = 'weekly_bulk'
WHERE initiated_by = 'cron' AND workflow_type = 'self_withdrawal';

-- Historical payouts left in a non-terminal state cannot be proven to have (or
-- not have) reached the provider. Flag them for manual reconciliation. Funds
-- are NOT released automatically.
UPDATE public.owner_payouts
SET reconciliation_required = true,
    reconciliation_reason = COALESCE(reconciliation_reason,
      'Pre-existing non-terminal payout at migration time; verify with provider before any release')
WHERE status IN ('authorized', 'captured', 'processing')
  AND reconciliation_required = false;

CREATE INDEX IF NOT EXISTS idx_owner_payouts_weekly_due
  ON public.owner_payouts (scheduled_for)
  WHERE workflow_type = 'weekly_bulk' AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_owner_payouts_reconciliation
  ON public.owner_payouts (created_at)
  WHERE reconciliation_required;

-- One canonical payout per logical request and per authorization. Created only
-- when existing data has no duplicates so the migration cannot fail on legacy rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.owner_payouts
    WHERE idempotency_key IS NOT NULL
    GROUP BY owner_id, idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'owner_payouts has duplicate (owner_id, idempotency_key); unique index skipped';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_payouts_owner_idempotency
      ON public.owner_payouts (owner_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owner_payouts
    WHERE authorization_id IS NOT NULL
    GROUP BY authorization_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'owner_payouts has duplicate authorization_id; unique index skipped';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_payouts_authorization
      ON public.owner_payouts (authorization_id)
      WHERE authorization_id IS NOT NULL;
  END IF;
END $$;

-- 1b. State-machine trigger fix. The original body referenced NEW.driver_id /
-- NEW.payment_method, which do not exist on owner_payouts, so every payout
-- status change raised "record new has no field ...". Resolve the entity-specific
-- columns through to_jsonb(NEW) instead. Transition rules are unchanged.
CREATE OR REPLACE FUNCTION public.enforce_payment_state_machine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _canonical text[] := ARRAY['pending','authorized','captured','settled','available','completed','failed','refunded','disputed'];
  _attempt integer;
  _uid uuid := auth.uid();
  _row jsonb := to_jsonb(NEW);
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
    CASE WHEN _entity = 'payment' THEN (_row->>'driver_id')::uuid ELSE (_row->>'owner_id')::uuid END,
    OLD.status, NEW.status, _uid,
    CASE
      WHEN _uid IS NULL THEN 'system'
      WHEN public.has_role(_uid, 'admin') THEN 'admin'
      ELSE 'user'
    END,
    _attempt,
    CASE WHEN _entity = 'payout' THEN _row->>'provider' ELSE _row->>'payment_method' END,
    jsonb_build_object('amount', _row->'amount', 'currency', _row->>'currency')
  );

  RETURN NEW;
END;
$$;

-- 2. Self-withdrawals must carry an authorization at creation ----------------
CREATE OR REPLACE FUNCTION public.enforce_owner_payout_creation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.workflow_type = 'self_withdrawal' AND NEW.authorization_id IS NULL THEN
    RAISE EXCEPTION 'self-withdrawal payouts require a withdrawal authorization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_payouts_enforce_creation ON public.owner_payouts;
CREATE TRIGGER trg_owner_payouts_enforce_creation
  BEFORE INSERT ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_payout_creation();

-- Owners may no longer insert payout rows directly; creation goes through
-- create_owner_self_withdrawal() (service role) which validates and consumes
-- the authorization atomically.
DROP POLICY IF EXISTS "Owners initiate their payouts" ON public.owner_payouts;
DROP POLICY IF EXISTS "Admins insert payouts" ON public.owner_payouts;
CREATE POLICY "Admins insert payouts"
  ON public.owner_payouts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- 3. Atomic self-withdrawal: validate + consume authorization + create payout
--    + reserve wallet funds in ONE transaction ------------------------------
CREATE OR REPLACE FUNCTION public.create_owner_self_withdrawal(
  _owner_id uuid,
  _authorization_id uuid,
  _payout_account_id uuid,
  _amount numeric,
  _currency text,
  _provider text,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cur text := upper(coalesce(_currency, ''));
  _prov text := lower(coalesce(_provider, ''));
  _existing public.owner_payouts%ROWTYPE;
  _auth public.withdrawal_authorizations%ROWTYPE;
  _acct public.owner_payout_accounts%ROWTYPE;
  _wallet_id uuid;
  _available numeric;
  _payout_id uuid := gen_random_uuid();
  _ref text;
  _ledger jsonb;
  _transition jsonb;
  _rows integer;
BEGIN
  IF _owner_id IS NULL OR _authorization_id IS NULL OR _payout_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request', 'error', 'owner, authorization and payout account are required');
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_amount', 'error', 'amount must be positive with at most 2 decimals');
  END IF;
  IF _prov NOT IN ('paypal', 'paystack') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_provider', 'error', 'unsupported provider');
  END IF;
  IF _idempotency_key IS NULL OR _idempotency_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_idempotency_key', 'error', 'a stable idempotency key of 8-100 safe characters is required');
  END IF;

  -- Serialise every withdrawal attempt of this owner.
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_payout:' || _owner_id::text, 0));

  -- Idempotent replay: return the canonical payout, never a second one.
  SELECT * INTO _existing FROM public.owner_payouts
  WHERE owner_id = _owner_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _existing.amount <> _amount
       OR upper(_existing.currency) <> _cur
       OR _existing.provider <> _prov
       OR _existing.payout_account_id IS DISTINCT FROM _payout_account_id
       OR _existing.authorization_id IS DISTINCT FROM _authorization_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict',
        'error', 'idempotency key already belongs to a different payout request');
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'payout_id', _existing.id,
      'transfer_reference', _existing.transfer_reference, 'status', _existing.status,
      'provider_attempts', _existing.provider_attempts,
      'reconciliation_required', _existing.reconciliation_required);
  END IF;

  -- Destination must belong to the owner and match provider/currency.
  SELECT * INTO _acct FROM public.owner_payout_accounts
  WHERE id = _payout_account_id AND owner_id = _owner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_account', 'error', 'payout account not found for this owner');
  END IF;
  IF lower(_acct.provider) <> _prov OR upper(_acct.currency) <> _cur
     OR (_prov = 'paypal' AND coalesce(_acct.paypal_email, '') = '')
     OR (_prov = 'paystack' AND coalesce(_acct.recipient_code, '') = '') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_account', 'error', 'payout account does not match provider/currency or is incomplete');
  END IF;

  -- Lock and validate the authorization.
  SELECT * INTO _auth FROM public.withdrawal_authorizations WHERE id = _authorization_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_not_found', 'error', 'withdrawal authorization not found');
  END IF;
  IF _auth.subject_user_id <> _owner_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_wrong_owner', 'error', 'withdrawal authorization belongs to another user');
  END IF;
  IF _auth.request_type <> 'owner_payout' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_type_mismatch', 'error', 'withdrawal authorization type mismatch');
  END IF;
  IF _auth.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_not_approved', 'error', 'withdrawal authorization is ' || _auth.status);
  END IF;
  IF _auth.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_expired', 'error', 'withdrawal authorization expired');
  END IF;
  IF _auth.amount <> _amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_amount_mismatch', 'error', 'withdrawal authorization amount mismatch');
  END IF;
  IF upper(_auth.currency) <> _cur THEN
    RETURN jsonb_build_object('ok', false, 'code', 'authorization_currency_mismatch', 'error', 'withdrawal authorization currency mismatch');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owner_payouts
    WHERE owner_id = _owner_id
      AND workflow_type = 'self_withdrawal'
      AND status IN ('pending', 'authorized', 'captured', 'processing')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payout_in_progress', 'error', 'A payout is already in progress');
  END IF;

  -- Lock the wallet so the balance check and the reservation are atomic.
  _wallet_id := public.ensure_wallet_account(_owner_id, 'owner', _cur);
  PERFORM 1 FROM public.wallet_accounts WHERE id = _wallet_id FOR UPDATE;
  _available := public.get_owner_available_balance(_owner_id, _cur);
  IF _available IS NULL OR _available < _amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'insufficient_balance',
      'error', 'Insufficient available balance', 'available', _available);
  END IF;

  _ref := 'pyt_' || replace(_payout_id::text, '-', '');

  INSERT INTO public.owner_payouts (
    id, owner_id, payout_account_id, authorization_id, provider, amount, currency,
    status, transfer_reference, initiated_by, scheduled_for, workflow_type, idempotency_key
  ) VALUES (
    _payout_id, _owner_id, _payout_account_id, _authorization_id, _prov, _amount, _cur,
    'pending', _ref, 'owner', now(), 'self_withdrawal', _idempotency_key
  );

  -- Reserve funds BEFORE any provider call. A posted debit is the single
  -- authoritative payout debit; it is reversed at most once on verified failure.
  _ledger := public.post_wallet_entry(
    _owner_id, 'owner', _cur, 'debit', _amount, 'payout',
    'payout:' || _payout_id::text || ':reserved',
    'owner_payouts', _payout_id, _prov, _ref,
    'Owner payout reserved before provider disbursement'
  );
  IF _ledger IS NULL OR _ledger->>'entry_id' IS NULL OR coalesce((_ledger->>'duplicate')::boolean, false) THEN
    RAISE EXCEPTION 'wallet reservation failed for payout %', _payout_id;
  END IF;

  UPDATE public.withdrawal_authorizations
  SET status = 'consumed', consumed_at = now(), consumed_reference = _payout_id
  WHERE id = _authorization_id AND status = 'approved' AND expires_at > now();
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    RAISE EXCEPTION 'withdrawal authorization % could not be consumed', _authorization_id;
  END IF;

  UPDATE public.owner_payouts SET reserved_at = now() WHERE id = _payout_id;

  _transition := public.transition_payment_state(
    'payout', _payout_id, 'authorized', 'withdrawal authorization consumed',
    jsonb_build_object('authorization_id', _authorization_id, 'workflow_type', 'self_withdrawal'));
  IF coalesce((_transition->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'payout state transition failed: %', _transition->>'error';
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'payout_id', _payout_id,
    'transfer_reference', _ref, 'status', 'authorized', 'provider_attempts', 0,
    'reconciliation_required', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_owner_self_withdrawal(uuid, uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_owner_self_withdrawal(uuid, uuid, uuid, numeric, text, text, text) TO service_role;

-- 4. Admin approval of a weekly payout --------------------------------------
CREATE OR REPLACE FUNCTION public.approve_weekly_owner_payout(_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rows integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin role required');
  END IF;
  UPDATE public.owner_payouts
  SET weekly_approved_by = auth.uid(), weekly_approved_at = now()
  WHERE id = _payout_id AND workflow_type = 'weekly_bulk' AND status = 'pending'
    AND weekly_approved_at IS NULL AND reserved_at IS NOT NULL;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout is not an unapproved pending weekly payout');
  END IF;
  RETURN jsonb_build_object('ok', true, 'payout_id', _payout_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_weekly_owner_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_weekly_owner_payout(uuid) TO authenticated, service_role;

-- 5. Atomic claims: at most one winner may call the provider -----------------
CREATE OR REPLACE FUNCTION public.claim_weekly_owner_payout(_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.owner_payouts%ROWTYPE; _transition jsonb;
BEGIN
  UPDATE public.owner_payouts
  SET provider_attempts = provider_attempts + 1, updated_at = now()
  WHERE id = _payout_id
    AND workflow_type = 'weekly_bulk'
    AND status = 'pending'
    AND weekly_approved_at IS NOT NULL
    AND reserved_at IS NOT NULL
    AND scheduled_for IS NOT NULL AND scheduled_for <= now()
    AND provider_attempts = 0
    AND NOT reconciliation_required
  RETURNING * INTO _p;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;
  _transition := public.transition_payment_state(
    'payout', _p.id, 'authorized', 'weekly payout claimed by worker',
    jsonb_build_object('workflow_type', 'weekly_bulk', 'approved_by', _p.weekly_approved_by));
  IF coalesce((_transition->>'ok')::boolean, false) = false THEN
    RAISE EXCEPTION 'payout state transition failed: %', _transition->>'error';
  END IF;
  RETURN jsonb_build_object('claimed', true, 'payout_id', _p.id, 'owner_id', _p.owner_id,
    'provider', _p.provider, 'amount', _p.amount, 'currency', _p.currency,
    'payout_account_id', _p.payout_account_id, 'transfer_reference', _p.transfer_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_owner_payout_provider_attempt(_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.owner_payouts%ROWTYPE;
BEGIN
  UPDATE public.owner_payouts
  SET provider_attempts = provider_attempts + 1, updated_at = now()
  WHERE id = _payout_id
    AND status = 'authorized'
    AND provider_attempts = 0
    AND NOT reconciliation_required
  RETURNING * INTO _p;
  RETURN jsonb_build_object('claimed', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_owner_payout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_owner_payout_provider_attempt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_owner_payout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_owner_payout_provider_attempt(uuid) TO service_role;

-- 6. Provider outcome recording & reconciliation ----------------------------
-- Provider accepted the request: submission, NOT settlement.
CREATE OR REPLACE FUNCTION public.record_owner_payout_submitted(
  _payout_id uuid, _transfer_code text, _provider_status text, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _t jsonb;
BEGIN
  SELECT status INTO _status FROM public.owner_payouts WHERE id = _payout_id FOR UPDATE;
  IF _status IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'payout not found'); END IF;
  UPDATE public.owner_payouts
  SET transfer_code = coalesce(_transfer_code, transfer_code),
      raw_payload = coalesce(_payload, '{}'::jsonb),
      submitted_at = coalesce(submitted_at, now()),
      failure_reason = NULL,
      reconciliation_required = false,
      reconciliation_reason = NULL
  WHERE id = _payout_id;
  IF _status = 'authorized' THEN
    _t := public.transition_payment_state('payout', _payout_id, 'captured',
      'transfer submitted to provider', jsonb_build_object('provider_status', _provider_status, 'transfer_code', _transfer_code));
    IF coalesce((_t->>'ok')::boolean, false) = false THEN
      RAISE EXCEPTION 'payout state transition failed: %', _t->>'error';
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _status = 'authorized' THEN 'captured' ELSE _status END);
END;
$$;

-- Provider outcome is unknown (timeout, incomplete response): keep funds reserved.
CREATE OR REPLACE FUNCTION public.mark_owner_payout_reconciliation_required(
  _payout_id uuid, _reason text, _payload jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.owner_payouts
  SET reconciliation_required = true,
      reconciliation_reason = _reason,
      failure_reason = _reason,
      raw_payload = coalesce(_payload, raw_payload)
  WHERE id = _payout_id AND status NOT IN ('completed', 'failed', 'refunded', 'cancelled');
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

-- Final outcome from verified provider evidence (authenticated webhook or
-- authenticated provider status lookup). Idempotent: settlement posts NO second
-- ledger entry (the reservation debit is the payout debit); a failed/reversed
-- transfer credits the reservation back exactly once (idempotent ledger key).
CREATE OR REPLACE FUNCTION public.finalize_owner_payout(
  _payout_id uuid,
  _outcome text,
  _provider text,
  _evidence jsonb DEFAULT '{}'::jsonb,
  _expected_amount numeric DEFAULT NULL,
  _expected_currency text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.owner_payouts%ROWTYPE;
  _ledger jsonb;
  _t jsonb;
BEGIN
  IF _outcome NOT IN ('settled', 'failed', 'reversed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown outcome');
  END IF;

  SELECT * INTO _p FROM public.owner_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'payout not found'); END IF;
  IF _p.provider <> lower(coalesce(_provider, '')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'provider mismatch');
  END IF;
  IF _expected_amount IS NOT NULL AND _expected_amount <> _p.amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount mismatch');
  END IF;
  IF _expected_currency IS NOT NULL AND upper(_expected_currency) <> upper(_p.currency) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'currency mismatch');
  END IF;

  -- Replays of an already-applied outcome are no-ops.
  IF (_outcome = 'settled' AND _p.status IN ('settled', 'completed'))
     OR (_outcome = 'failed' AND _p.status = 'failed')
     OR (_outcome = 'reversed' AND _p.status = 'refunded') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', _p.status);
  END IF;

  IF _outcome = 'settled' THEN
    IF _p.status = 'authorized' THEN
      _t := public.transition_payment_state('payout', _p.id, 'captured', 'provider evidence received', _evidence);
      IF coalesce((_t->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', _t->>'error'; END IF;
      _p.status := 'captured';
    END IF;
    IF _p.status <> 'captured' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cannot settle payout in status ' || _p.status);
    END IF;
    _t := public.transition_payment_state('payout', _p.id, 'settled', 'provider confirmed the transfer', _evidence);
    IF coalesce((_t->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', _t->>'error'; END IF;
    _t := public.transition_payment_state('payout', _p.id, 'completed', 'payout complete', _evidence);
    IF coalesce((_t->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', _t->>'error'; END IF;
    UPDATE public.owner_payouts
    SET reconciliation_required = false, reconciliation_reason = NULL, failure_reason = NULL,
        raw_payload = coalesce(_evidence, raw_payload)
    WHERE id = _p.id;
    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'status', 'completed');
  END IF;

  -- failed / reversed: release the reservation exactly once.
  IF _outcome = 'failed' AND _p.status NOT IN ('authorized', 'captured') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot fail payout in status ' || _p.status);
  END IF;
  IF _outcome = 'reversed' AND _p.status NOT IN ('settled') THEN
    -- completed payouts have no 'refunded' transition; require manual review.
    UPDATE public.owner_payouts
    SET reconciliation_required = true,
        reconciliation_reason = 'provider reported reversal for payout in status ' || _p.status
    WHERE id = _p.id;
    RETURN jsonb_build_object('ok', false, 'error', 'reversal for payout in status ' || _p.status || ' requires manual reconciliation');
  END IF;

  _ledger := public.post_wallet_entry(
    _p.owner_id, 'owner', upper(_p.currency), 'credit', _p.amount, 'payout_reversal',
    'payout:' || _p.id::text || ':reversal',
    'owner_payouts', _p.id, _p.provider, _p.transfer_reference,
    'Owner payout reservation released: provider reported ' || _outcome);
  IF _ledger IS NULL OR _ledger->>'entry_id' IS NULL THEN
    RAISE EXCEPTION 'reservation release failed for payout %', _p.id;
  END IF;

  _t := public.transition_payment_state('payout', _p.id,
    CASE WHEN _outcome = 'failed' THEN 'failed' ELSE 'refunded' END,
    'provider reported ' || _outcome, _evidence);
  IF coalesce((_t->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', _t->>'error'; END IF;

  UPDATE public.owner_payouts
  SET reconciliation_required = false, reconciliation_reason = NULL,
      failure_reason = coalesce(_evidence->>'reason', 'provider reported ' || _outcome),
      raw_payload = coalesce(_evidence, raw_payload)
  WHERE id = _p.id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false,
    'status', CASE WHEN _outcome = 'failed' THEN 'failed' ELSE 'refunded' END);
END;
$$;

REVOKE ALL ON FUNCTION public.record_owner_payout_submitted(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_owner_payout_reconciliation_required(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_owner_payout(uuid, text, text, jsonb, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_payout_submitted(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_owner_payout_reconciliation_required(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_owner_payout(uuid, text, text, jsonb, numeric, text) TO service_role;
