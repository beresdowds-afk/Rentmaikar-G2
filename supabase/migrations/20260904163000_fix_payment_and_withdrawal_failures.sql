-- Fix payment failures for drivers and owners, and withdrawal failures for owners
-- 1. Ensure get_ledger_balance handles case-insensitive currency
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
    AND UPPER(e.currency) = UPPER(_currency)
    AND (
      e.status = 'posted'
      OR (_include_pending AND e.status = 'pending')
    );
$$;

REVOKE ALL ON FUNCTION public.get_ledger_balance(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_balance(uuid, text, text, boolean) TO authenticated, service_role;

-- 2. Owner available balance: check ledger first, with fallback to owner_earnings if ledger is empty
CREATE OR REPLACE FUNCTION public.get_owner_available_balance(
  _owner_id uuid,
  _currency text
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  bal numeric;
  legacy_earnings numeric := 0;
  legacy_payouts numeric := 0;
  has_ledger boolean := false;
BEGIN
  bal := public.get_ledger_balance(_owner_id, 'owner', UPPER(_currency), false);
  
  -- If ledger has posted positive balance, use it
  SELECT EXISTS(
    SELECT 1 FROM public.wallet_ledger_entries e
    JOIN public.wallet_accounts w ON w.id = e.wallet_id
    WHERE e.user_id = _owner_id AND w.account_type = 'owner' AND UPPER(e.currency) = UPPER(_currency)
  ) INTO has_ledger;

  IF has_ledger AND bal > 0 THEN
    RETURN COALESCE(bal, 0);
  END IF;

  -- Fallback to owner_earnings minus owner_payouts for accounts before ledger entries
  SELECT COALESCE(SUM(amount), 0) INTO legacy_earnings
  FROM public.owner_earnings
  WHERE owner_id = _owner_id AND UPPER(currency) = UPPER(_currency) AND status IN ('available', 'pending', 'paid');

  SELECT COALESCE(SUM(amount), 0) INTO legacy_payouts
  FROM public.owner_payouts
  WHERE owner_id = _owner_id AND UPPER(currency) = UPPER(_currency) AND status IN ('pending', 'authorized', 'captured', 'processing', 'completed', 'settled');

  IF legacy_earnings > legacy_payouts THEN
    RETURN (legacy_earnings - legacy_payouts)::numeric(14,2);
  END IF;

  RETURN COALESCE(bal, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_owner_available_balance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) TO authenticated, service_role;

-- 3. Update payment_preflight:
-- - Stop blocking payments on pending Persona verification (treat as warning instead)
-- - Support driver_payment, invoice_payment, and owner_payment without requiring driver role only
CREATE OR REPLACE FUNCTION public.payment_preflight(_operation text, _context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  prof public.profiles%ROWTYPE;
  blockers text[] := '{}';
  warnings text[] := '{}';
  amt numeric := NULLIF(_context->>'amount','')::numeric;
  cur text := UPPER(COALESCE(NULLIF(_context->>'currency',''), 'USD'));
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
    IF prof.email_verified IS NOT TRUE THEN warnings := warnings || 'EMAIL_NOT_VERIFIED'; END IF;
    IF prof.phone_verified IS NOT TRUE THEN warnings := warnings || 'PHONE_NOT_VERIFIED'; END IF;
    IF prof.onboarding_completed_at IS NULL THEN warnings := warnings || 'ONBOARDING_INCOMPLETE'; END IF;
    IF prof.identity_verified_at IS NULL THEN
      IF COALESCE(prof.identity_verification_status,'') IN ('pending','submitted','processing') THEN
        warnings := warnings || 'PERSONA_PENDING';
      ELSE
        warnings := warnings || 'PERSONA_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF amt IS NOT NULL AND amt <= 0 THEN blockers := blockers || 'AMOUNT_INVALID'; END IF;
  IF cur NOT IN ('USD','NGN') THEN blockers := blockers || 'CURRENCY_UNSUPPORTED'; END IF;

  IF _operation IN ('driver_payment', 'invoice_payment', 'owner_payment') THEN
    IF NOT (public.has_role(uid, 'driver') OR public.has_role(uid, 'owner') OR public.has_role(uid, 'admin')) THEN
      blockers := blockers || 'ROLE_UNAUTHORIZED';
    END IF;
    IF amt IS NULL THEN blockers := blockers || 'AMOUNT_MISSING'; END IF;

  ELSIF _operation = 'owner_payout' THEN
    IF NOT (public.has_role(uid, 'owner') OR public.has_role(uid, 'admin')) THEN
      blockers := blockers || 'ROLE_NOT_OWNER';
    END IF;
    SELECT * INTO acct FROM public.owner_payout_accounts
      WHERE owner_id = uid AND UPPER(currency) = cur
      ORDER BY is_default DESC, created_at DESC LIMIT 1;
    IF NOT FOUND THEN
      blockers := blockers || 'PAYOUT_ACCOUNT_MISSING';
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
