-- 1. Owner self-service: auto-authorize owner payouts unless the ledger cannot cover them.
CREATE OR REPLACE FUNCTION public.evaluate_withdrawal_risk(
  _user_id uuid, _amount numeric, _currency text,
  _device_fingerprint text DEFAULT NULL::text,
  _request_type text DEFAULT 'owner_payout'::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flags text[] := '{}';
  score integer := 0;
  cnt_1h integer;
  cnt_24h integer;
  sum_24h numeric;
  avg_prior numeric;
  known_device boolean;
  balance numeric;
  insufficient boolean := false;
  big_threshold numeric := CASE WHEN _currency = 'NGN' THEN 2000000 ELSE 2500 END;
BEGIN
  SELECT COUNT(*) INTO cnt_1h FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND created_at > now() - interval '1 hour';
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO cnt_24h, sum_24h
   FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND currency = _currency
     AND created_at > now() - interval '24 hours'
     AND status <> 'rejected';

  IF cnt_1h >= 3 THEN flags := flags || 'VELOCITY_HOURLY'; score := score + 30; END IF;
  IF cnt_24h >= 5 THEN flags := flags || 'VELOCITY_DAILY'; score := score + 25; END IF;

  SELECT AVG(amount) INTO avg_prior FROM public.withdrawal_authorizations
   WHERE subject_user_id = _user_id AND currency = _currency AND status = 'consumed';
  IF avg_prior IS NOT NULL AND _amount > avg_prior * 3 THEN
    flags := flags || 'AMOUNT_ANOMALY'; score := score + 25;
  END IF;

  IF _amount >= big_threshold THEN flags := flags || 'LARGE_AMOUNT'; score := score + 20; END IF;
  IF sum_24h + _amount >= big_threshold * 2 THEN flags := flags || 'DAILY_TOTAL_HIGH'; score := score + 20; END IF;

  IF _device_fingerprint IS NULL OR _device_fingerprint = '' THEN
    flags := flags || 'DEVICE_UNKNOWN'; score := score + 15;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.withdrawal_authorizations
      WHERE subject_user_id = _user_id
        AND device_fingerprint = _device_fingerprint
        AND created_at < now() - interval '10 minutes'
    ) INTO known_device;
    IF NOT known_device THEN flags := flags || 'DEVICE_NEW'; score := score + 20; END IF;
  END IF;

  IF _request_type = 'owner_payout' THEN
    balance := public.get_ledger_balance(_user_id, 'owner', _currency, false);
    IF balance IS NULL OR balance < _amount THEN
      insufficient := true;
      flags := flags || 'INSUFFICIENT_LEDGER_BALANCE'; score := score + 60;
    END IF;
  END IF;

  IF _request_type IN ('platform_withdrawal','treasury_transfer') THEN
    flags := flags || 'PLATFORM_TREASURY'; score := score + 40;
  END IF;

  RETURN jsonb_build_object(
    'score', LEAST(score, 100),
    'flags', to_jsonb(flags),
    -- Owners withdraw their own money without admin approval. The single
    -- exception is a request the owner ledger cannot cover; platform and
    -- treasury movements always keep dual authorization.
    'requires_dual_auth',
      CASE WHEN _request_type = 'owner_payout' THEN insufficient ELSE true END,
    'level', CASE WHEN score >= 60 THEN 'high' WHEN score >= 30 THEN 'medium' ELSE 'low' END,
    'available_balance', balance,
    'window', jsonb_build_object('count_1h', cnt_1h, 'count_24h', cnt_24h, 'sum_24h', sum_24h)
  );
END;
$$;

-- 2. Full audit trail + admin alerting for every self-service withdrawal.
CREATE OR REPLACE FUNCTION public.log_owner_payout_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  authz record;
  owner_name text;
  cur_currency text := COALESCE(NEW.currency, 'USD');
  risky boolean := false;
  note text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO owner_name FROM public.profiles WHERE user_id = NEW.owner_id;

  SELECT * INTO authz
    FROM public.withdrawal_authorizations
   WHERE subject_user_id = NEW.owner_id
     AND request_type = 'owner_payout'
     AND amount = NEW.amount
   ORDER BY created_at DESC
   LIMIT 1;

  risky := COALESCE(authz.risk_score, 0) >= 40;

  INSERT INTO public.admin_audit_log(admin_id, action, target_table, target_id, details)
  VALUES (
    NEW.owner_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'owner_withdrawal_initiated'
         ELSE 'owner_withdrawal_' || NEW.status END,
    'owner_payouts',
    NEW.id,
    jsonb_build_object(
      'owner_id', NEW.owner_id,
      'owner_name', owner_name,
      'amount', NEW.amount,
      'currency', cur_currency,
      'provider', NEW.provider,
      'status', NEW.status,
      'initiated_by', NEW.initiated_by,
      'transfer_reference', NEW.transfer_reference,
      'failure_reason', NEW.failure_reason,
      'authorization_id', authz.id,
      'risk_score', authz.risk_score,
      'risk_flags', authz.risk_flags,
      'self_service', NEW.initiated_by = 'owner'
    )
  );

  IF (TG_OP = 'INSERT' AND risky) OR NEW.status = 'failed' THEN
    note := CASE
      WHEN NEW.status = 'failed'
        THEN 'Owner withdrawal failed: ' || COALESCE(NEW.failure_reason, 'no reason reported')
      ELSE 'High-risk self-service withdrawal (score ' || COALESCE(authz.risk_score, 0) || '): '
           || COALESCE(array_to_string(authz.risk_flags, ', '), 'no flags')
    END;

    INSERT INTO public.admin_notifications(recipient_id, kind, title, body, related_user_id, metadata)
    SELECT ur.user_id,
           CASE WHEN NEW.status = 'failed' THEN 'owner_withdrawal_failed'
                ELSE 'owner_withdrawal_high_risk' END,
           CASE WHEN NEW.status = 'failed' THEN 'Owner withdrawal failed'
                ELSE 'High-risk owner withdrawal' END,
           COALESCE(owner_name, 'An owner') || ' · ' || cur_currency || ' ' || NEW.amount || ' · ' || note,
           NEW.owner_id,
           jsonb_build_object(
             'payout_id', NEW.id,
             'owner_id', NEW.owner_id,
             'amount', NEW.amount,
             'currency', cur_currency,
             'provider', NEW.provider,
             'status', NEW.status,
             'risk_score', authz.risk_score,
             'risk_flags', authz.risk_flags,
             'reason', note)
      FROM public.user_roles ur
     WHERE ur.role = 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_owner_payout_activity ON public.owner_payouts;
CREATE TRIGGER trg_log_owner_payout_activity
AFTER INSERT OR UPDATE ON public.owner_payouts
FOR EACH ROW EXECUTE FUNCTION public.log_owner_payout_activity();

-- 3. Reconciliation of a single withdrawal against the wallet ledger.
CREATE OR REPLACE FUNCTION public.reconcile_owner_payout(_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  ledger_count integer := 0;
  ledger_amount numeric := 0;
  posted_amount numeric := 0;
  issues text[] := '{}';
BEGIN
  SELECT * INTO p FROM public.owner_payouts WHERE id = _payout_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', to_jsonb(ARRAY['payout_not_found'])); END IF;

  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_admin_privilege(auth.uid(), 'can_view_payments')
          OR p.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0),
         COALESCE(SUM(amount) FILTER (WHERE status = 'posted'), 0)
    INTO ledger_count, ledger_amount, posted_amount
    FROM public.wallet_ledger_entries
   WHERE reference_table = 'owner_payouts' AND reference_id = _payout_id;

  IF ledger_count = 0 THEN issues := issues || 'missing_ledger_entry'; END IF;
  IF ledger_count > 0 AND ledger_amount <> p.amount THEN issues := issues || 'ledger_amount_mismatch'; END IF;
  IF p.status IN ('completed','settled') AND posted_amount <> p.amount THEN
    issues := issues || 'ledger_not_posted';
  END IF;
  IF p.status = 'failed' AND posted_amount > 0 THEN issues := issues || 'failed_payout_still_debited'; END IF;

  RETURN jsonb_build_object(
    'ok', array_length(issues, 1) IS NULL,
    'issues', to_jsonb(issues),
    'payout_id', p.id,
    'status', p.status,
    'amount', p.amount,
    'currency', p.currency,
    'ledger_entries', ledger_count,
    'ledger_amount', ledger_amount,
    'ledger_posted_amount', posted_amount,
    'owner_balance_after', public.get_ledger_balance(p.owner_id, 'owner', p.currency, false));
END;
$$;

-- 4. Admin report: every owner withdrawal with risk, ledger and revenue context.
CREATE OR REPLACE FUNCTION public.admin_list_owner_withdrawals(_status text DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS TABLE (
  payout_id uuid, owner_id uuid, owner_name text, owner_email text,
  provider text, amount numeric, currency text, status text,
  initiated_by text, transfer_reference text, failure_reason text,
  created_at timestamptz, processed_at timestamptz,
  risk_score integer, risk_flags text[], authorization_status text, requires_dual_auth boolean,
  ledger_entries integer, ledger_amount numeric, ledger_posted_amount numeric,
  owner_balance numeric, gross_earnings numeric, reconciliation jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR public.has_admin_privilege(auth.uid(), 'can_view_payments')) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.owner_id, pr.full_name, pr.email,
         p.provider, p.amount, p.currency, p.status,
         p.initiated_by, p.transfer_reference, p.failure_reason,
         p.created_at, p.processed_at,
         COALESCE(wa.risk_score, 0), COALESCE(wa.risk_flags, '{}'::text[]),
         wa.status, COALESCE(wa.requires_dual_auth, false),
         COALESCE(l.cnt, 0)::integer, COALESCE(l.total, 0), COALESCE(l.posted, 0),
         public.get_ledger_balance(p.owner_id, 'owner', p.currency, false),
         COALESCE(e.gross, 0),
         public.reconcile_owner_payout(p.id)
    FROM public.owner_payouts p
    LEFT JOIN public.profiles pr ON pr.user_id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT w.* FROM public.withdrawal_authorizations w
       WHERE w.subject_user_id = p.owner_id AND w.request_type = 'owner_payout'
         AND w.amount = p.amount AND w.created_at <= p.created_at + interval '10 minutes'
       ORDER BY w.created_at DESC LIMIT 1) wa ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) cnt, COALESCE(SUM(le.amount), 0) total,
             COALESCE(SUM(le.amount) FILTER (WHERE le.status = 'posted'), 0) posted
        FROM public.wallet_ledger_entries le
       WHERE le.reference_table = 'owner_payouts' AND le.reference_id = p.id) l ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oe.owner_amount), 0) gross
        FROM public.owner_earnings oe WHERE oe.owner_id = p.owner_id) e ON true
   WHERE (_status IS NULL OR p.status = _status)
   ORDER BY p.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_owner_withdrawals(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_owner_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_owner_withdrawals(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_owner_payout(uuid) TO authenticated;