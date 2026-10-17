-- Server-side authority for what a payment initiation may collect.
-- Backward compatible: adds functions and a guard trigger only; no columns,
-- no policy or grant changes on existing objects.
--
-- Rules reuse existing records only:
--   security_deposit  -> rentals.security_deposit_amount / _currency / _status
--   rental, late_fee  -> an existing invoice (public.invoices) addressed to the
--                        paying driver; the invoice total is the only amount
--                        that may be collected (no partial payments: there is
--                        no record of amounts already paid against an invoice)
--   anything else     -> no authoritative rule: fail closed
-- A client supplied amount is only ever compared against the authoritative one.

CREATE OR REPLACE FUNCTION public.resolve_payment_obligation(
  _driver_id uuid,
  _purpose text,
  _rental_id uuid DEFAULT NULL,
  _invoice_id uuid DEFAULT NULL,
  _client_amount numeric DEFAULT NULL,
  _client_currency text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r public.rentals%ROWTYPE;
  _i public.invoices%ROWTYPE;
  _amount numeric;
  _cur text;
  _linked_status text;
BEGIN
  IF _driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'driver_required');
  END IF;

  IF _purpose = 'security_deposit' THEN
    IF _rental_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rental_required');
    END IF;
    SELECT * INTO _r FROM public.rentals WHERE id = _rental_id FOR UPDATE;
    IF NOT FOUND OR _r.driver_id <> _driver_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rental_not_found_for_driver');
    END IF;
    IF _r.security_deposit_amount IS NULL OR _r.security_deposit_amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'no_deposit_rule');
    END IF;
    IF coalesce(_r.security_deposit_status, 'pending') <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'deposit_not_payable');
    END IF;
    IF EXISTS (SELECT 1 FROM public.payments p
                WHERE p.rental_id = _rental_id AND p.purpose = 'security_deposit'
                  AND p.status IN ('completed','settled','captured')) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_paid');
    END IF;
    _amount := _r.security_deposit_amount;
    _cur := upper(coalesce(_r.security_deposit_currency, _r.currency));

  ELSIF _purpose IN ('rental','late_fee') THEN
    IF _invoice_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_required');
    END IF;
    SELECT * INTO _i FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
    IF NOT FOUND OR _i.driver_id IS DISTINCT FROM _driver_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found_for_driver');
    END IF;
    IF _rental_id IS NOT NULL AND _i.rental_id IS DISTINCT FROM _rental_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_rental_mismatch');
    END IF;
    IF (_purpose = 'rental' AND _i.invoice_type NOT IN ('rental'))
       OR (_purpose = 'late_fee' AND _i.invoice_type NOT IN ('fee')) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_purpose_mismatch');
    END IF;
    IF _i.status NOT IN ('draft','sent','overdue') THEN
      -- 'partial' is rejected on purpose: the amount already paid is not recorded.
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_payable');
    END IF;
    IF _i.payment_id IS NOT NULL THEN
      SELECT status INTO _linked_status FROM public.payments WHERE id = _i.payment_id;
      IF _linked_status IS NOT NULL AND _linked_status NOT IN ('failed','cancelled') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'payment_already_in_progress');
      END IF;
    END IF;
    _amount := _i.total_amount;
    _cur := upper(_i.currency);
    IF _amount IS NULL OR _amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invoice_amount_invalid');
    END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'no_authoritative_rule');
  END IF;

  IF _client_currency IS NOT NULL AND upper(_client_currency) <> _cur THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
  END IF;
  IF _client_amount IS NOT NULL AND round(_client_amount, 2) <> round(_amount, 2) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'expected_amount', _amount);
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'currency', _cur,
                            'invoice_id', _i.id, 'rental_id', _rental_id);
END $$;

-- Atomically reserve an invoice for exactly one in-flight payment.
CREATE OR REPLACE FUNCTION public.claim_invoice_for_payment(_invoice_id uuid, _payment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.invoices i
     SET payment_id = _payment_id, updated_at = now()
   WHERE i.id = _invoice_id
     AND i.status IN ('draft','sent','overdue')
     AND (i.payment_id IS NULL
          OR i.payment_id = _payment_id
          OR EXISTS (SELECT 1 FROM public.payments p
                      WHERE p.id = i.payment_id AND p.status IN ('failed','cancelled')));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;

-- Database-level guard covering every settlement path (backend and Edge
-- Functions): a payment may only become completed/settled if it matches its
-- authoritative obligation and the obligation is not already satisfied.
CREATE OR REPLACE FUNCTION public.guard_payment_obligation_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r public.rentals%ROWTYPE;
  _i public.invoices%ROWTYPE;
BEGIN
  IF NEW.purpose = 'security_deposit' AND NEW.rental_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.rentals WHERE id = NEW.rental_id FOR UPDATE;
    IF FOUND AND _r.security_deposit_amount IS NOT NULL THEN
      IF round(NEW.amount, 2) <> round(_r.security_deposit_amount, 2)
         OR upper(NEW.currency) <> upper(coalesce(_r.security_deposit_currency, _r.currency)) THEN
        RAISE EXCEPTION 'payment does not match the security deposit obligation' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM public.payments p
                  WHERE p.rental_id = NEW.rental_id AND p.purpose = 'security_deposit'
                    AND p.id <> NEW.id AND p.status IN ('completed','settled','captured')) THEN
        RAISE EXCEPTION 'security deposit already paid' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NEW.purpose IN ('rental','late_fee') THEN
    SELECT * INTO _i FROM public.invoices WHERE payment_id = NEW.id LIMIT 1;
    IF FOUND THEN
      IF round(NEW.amount, 2) <> round(_i.total_amount, 2)
         OR upper(NEW.currency) <> upper(_i.currency) THEN
        RAISE EXCEPTION 'payment does not match the invoice obligation' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_payment_obligation ON public.payments;
CREATE TRIGGER trg_guard_payment_obligation
  BEFORE UPDATE OF status ON public.payments
  FOR EACH ROW
  WHEN (NEW.status IN ('completed','settled','captured')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.guard_payment_obligation_on_completion();

REVOKE ALL ON FUNCTION public.resolve_payment_obligation(uuid,text,uuid,uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_invoice_for_payment(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payment_obligation(uuid,text,uuid,uuid,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_invoice_for_payment(uuid,uuid) TO service_role;
