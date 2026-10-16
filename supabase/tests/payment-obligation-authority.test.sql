-- Behavioural test for 20261016180000_payment_obligation_authority.sql.
-- Requires rentals, invoices and payments from the repository migrations
-- (or equivalent columns). Runs in a rolled-back transaction.
BEGIN;
CREATE FUNCTION pg_temp.assert(_ok boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(_ok,false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', _msg; END IF; END $$;

DO $$
DECLARE
  d uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  r uuid := gen_random_uuid(); inv uuid := gen_random_uuid(); inv2 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  res jsonb; ok boolean;
BEGIN
  INSERT INTO public.rentals(id, driver_id, owner_id, vehicle_id, daily_rate, currency, security_deposit_amount, security_deposit_currency, security_deposit_status)
    VALUES (r, d, o, gen_random_uuid(), 50, 'USD', 300, 'USD', 'pending');
  INSERT INTO public.invoices(id, invoice_type, status, driver_id, rental_id, amount, total_amount, currency)
    VALUES (inv, 'rental', 'sent', d, r, 350, 350, 'USD'), (inv2, 'rental', 'partial', d, r, 100, 100, 'USD');

  -- deposit: authoritative amount, client amount below/above rejected, currency, other driver
  res := public.resolve_payment_obligation(d, 'security_deposit', r, NULL, NULL, 'USD');
  PERFORM pg_temp.assert((res->>'ok')::boolean AND (res->>'amount')::numeric = 300, 'deposit amount from record');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'security_deposit',r,NULL,1,'USD')->>'reason' = 'amount_mismatch', 'lower amount');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'security_deposit',r,NULL,9999,'USD')->>'reason' = 'amount_mismatch', 'higher amount');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'security_deposit',r,NULL,300,'NGN')->>'reason' = 'currency_mismatch', 'currency');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d2,'security_deposit',r,NULL,300,'USD')->>'reason' = 'rental_not_found_for_driver', 'cross-user');

  -- invoice rules
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'rental',r,NULL,350,'USD')->>'reason' = 'invoice_required', 'rental without invoice fails closed');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'rental',r,inv,100,'USD')->>'reason' = 'amount_mismatch', 'partial rejected');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'rental',r,inv2,100,'USD')->>'reason' = 'invoice_not_payable', 'partial-status invoice rejected');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d2,'rental',r,inv,350,'USD')->>'reason' = 'invoice_not_found_for_driver', 'cross-user invoice');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'rental',r,inv,350,'USD')->>'ok' = 'true', 'exact invoice amount ok');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'iot_device',r,NULL,5,'USD')->>'reason' = 'no_authoritative_rule', 'ambiguous purpose fails closed');

  -- single in-flight payment per invoice
  INSERT INTO public.payments(id, amount, currency, status, driver_id, rental_id, purpose, payment_method) VALUES (p1, 350, 'USD', 'pending', d, r, 'rental', 'paystack');
  INSERT INTO public.payments(id, amount, currency, status, driver_id, rental_id, purpose, payment_method) VALUES (p2, 350, 'USD', 'pending', d, r, 'rental', 'paystack');
  PERFORM pg_temp.assert(public.claim_invoice_for_payment(inv, p1), 'first claim wins');
  PERFORM pg_temp.assert(NOT public.claim_invoice_for_payment(inv, p2), 'second claim loses');
  PERFORM pg_temp.assert(public.resolve_payment_obligation(d,'rental',r,inv,350,'USD')->>'reason' = 'payment_already_in_progress', 'in-progress blocks');

  -- completion guard: wrong amount on invoice-linked payment is rejected
  UPDATE public.payments SET amount = 10 WHERE id = p1;
  BEGIN
    UPDATE public.payments SET status = 'completed' WHERE id = p1;
    ok := true;
  EXCEPTION WHEN check_violation THEN ok := false; END;
  PERFORM pg_temp.assert(NOT ok, 'under-paid invoice payment cannot complete');
  UPDATE public.payments SET amount = 350 WHERE id = p1;
  UPDATE public.payments SET status = 'completed' WHERE id = p1;

  -- deposit guard: wrong amount rejected, exact accepted once, duplicate rejected
  INSERT INTO public.payments(id, amount, currency, status, driver_id, rental_id, purpose, payment_method) VALUES (p3, 5, 'USD', 'pending', d, r, 'security_deposit', 'paystack');
  BEGIN UPDATE public.payments SET status='completed' WHERE id = p3; ok := true;
  EXCEPTION WHEN check_violation THEN ok := false; END;
  PERFORM pg_temp.assert(NOT ok, 'wrong deposit amount cannot complete');
  UPDATE public.payments SET amount = 300 WHERE id = p3;
  UPDATE public.payments SET status='completed' WHERE id = p3;
  INSERT INTO public.payments(id, amount, currency, status, driver_id, rental_id, purpose, payment_method) VALUES (gen_random_uuid(), 300, 'USD', 'pending', d, r, 'security_deposit', 'paystack') RETURNING id INTO p3;
  BEGIN UPDATE public.payments SET status='completed' WHERE id = p3; ok := true;
  EXCEPTION WHEN check_violation THEN ok := false; END;
  PERFORM pg_temp.assert(NOT ok, 'duplicate deposit settlement rejected');
END $$;
ROLLBACK;
