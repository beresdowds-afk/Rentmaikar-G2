
CREATE OR REPLACE FUNCTION public.verify_payment_settlement(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _p public.payments%ROWTYPE;
  _issues text[] := ARRAY[]::text[];
  _inv uuid;
  _rcp uuid;
  _ledger int := 0;
  _audit int := 0;
  _sub_id uuid;
BEGIN
  SELECT * INTO _p FROM public.payments WHERE id = _payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'payment_id', _payment_id,
                              'issues', jsonb_build_array('payment_not_found'));
  END IF;

  IF _p.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'payment_id', _p.id,
                              'reason', 'payment_not_completed', 'issues', '[]'::jsonb);
  END IF;

  IF _p.settled_at IS NULL THEN
    _issues := _issues || 'not_settled';
  END IF;

  SELECT count(*) INTO _ledger
    FROM public.wallet_ledger_entries
   WHERE reference_table = 'payments' AND reference_id = _p.id;
  IF _ledger = 0 THEN
    _issues := _issues || 'missing_wallet_ledger_entries';
  END IF;

  SELECT id INTO _inv FROM public.invoices WHERE payment_id = _p.id LIMIT 1;
  IF _inv IS NULL THEN
    _issues := _issues || 'missing_invoice';
  END IF;

  SELECT id INTO _rcp FROM public.receipts WHERE payment_id = _p.id LIMIT 1;
  IF _rcp IS NULL THEN
    _issues := _issues || 'missing_receipt';
  END IF;

  SELECT count(*) INTO _audit
    FROM public.admin_audit_log
   WHERE action = 'payment_settled'
     AND target_table = 'payments'
     AND target_id = _p.id::text;
  IF _audit = 0 THEN
    _issues := _issues || 'missing_settlement_audit_row';
  END IF;

  IF _p.purpose LIKE 'subscription_%' THEN
    IF _p.subscription_plan_id IS NULL THEN
      _issues := _issues || 'subscription_plan_missing_on_payment';
    ELSE
      SELECT us.id INTO _sub_id
        FROM public.user_subscriptions us
       WHERE us.user_id = _p.driver_id
         AND us.plan_id = _p.subscription_plan_id
         AND us.status = 'active'
         AND (us.expires_at IS NULL OR us.expires_at > now())
       ORDER BY us.created_at DESC
       LIMIT 1;
      IF _sub_id IS NULL THEN
        _issues := _issues || 'subscription_not_active';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(_issues, 1) IS NULL,
    'payment_id', _p.id,
    'user_id', _p.driver_id,
    'purpose', _p.purpose,
    'amount', _p.amount,
    'currency', _p.currency,
    'settled_at', _p.settled_at,
    'invoice_id', _inv,
    'receipt_id', _rcp,
    'subscription_id', _sub_id,
    'ledger_entries', _ledger,
    'issues', to_jsonb(_issues));
END;
$fn$;

REVOKE ALL ON FUNCTION public.verify_payment_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_settlement(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_scan_settlement_integrity(
  _since timestamptz DEFAULT (now() - interval '7 days'),
  _limit int DEFAULT 200)
RETURNS TABLE(payment_id uuid, user_id uuid, purpose text, amount numeric,
              currency text, settled_at timestamptz, report jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_admin_privilege() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.driver_id, p.purpose, p.amount, p.currency, p.settled_at,
         public.verify_payment_settlement(p.id) AS report
    FROM public.payments p
   WHERE p.status = 'completed'
     AND p.created_at >= _since
   ORDER BY p.created_at DESC
   LIMIT least(greatest(_limit, 1), 1000);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_scan_settlement_integrity(timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_scan_settlement_integrity(timestamptz, int) TO authenticated, service_role;

-- Alert admins when settlement completes but the invoice could not be created.
CREATE OR REPLACE FUNCTION public.notify_settlement_invoice_failure(
  _payment_id uuid, _reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.admin_notifications(recipient_id, kind, title, body, related_user_id, metadata)
  SELECT ur.user_id,
         'settlement_invoice_failed',
         'Payment settled but invoice was not generated',
         'Payment ' || _payment_id || ' settled without an invoice: ' || coalesce(_reason, 'unknown reason'),
         (SELECT driver_id FROM public.payments WHERE id = _payment_id),
         jsonb_build_object('payment_id', _payment_id, 'reason', _reason)
    FROM public.user_roles ur
   WHERE ur.role = 'admin'::public.app_role;
$fn$;

REVOKE ALL ON FUNCTION public.notify_settlement_invoice_failure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_settlement_invoice_failure(uuid, text) TO service_role;
