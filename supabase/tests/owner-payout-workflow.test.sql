-- Behavioural test for 20261016120000_owner_payout_workflow_and_atomic_withdrawal.sql
-- Run with psql against a database that has the repository migrations applied
-- (service-role session, no auth.uid()). Every assertion raises on failure; the
-- whole script runs inside a transaction that is rolled back.
BEGIN;

CREATE FUNCTION pg_temp.assert(_ok boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(_ok, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', _msg; END IF; END $$;

DO $$
DECLARE
  o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid();
  acct uuid := gen_random_uuid(); acct2 uuid := gen_random_uuid();
  a1 uuid; a_wrong_type uuid; a_expired uuid; a_other uuid; a_cur uuid; a_amt uuid; a_rej uuid;
  r jsonb; r2 jsonb; pid uuid; bal numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES (o), (o2);
  INSERT INTO public.owner_payout_accounts(id, owner_id, country_code, provider, currency, paypal_email)
    VALUES (acct, o, 'US', 'paypal', 'USD', 'o@example.com'), (acct2, o2, 'US', 'paypal', 'USD', 'o2@example.com');
  PERFORM public.post_wallet_entry(o, 'owner', 'USD', 'credit', 500, 'adjustment', 'seed:' || o::text);

  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 100, 'USD', 'approved') RETURNING id INTO a1;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('platform_withdrawal', o, o, 100, 'USD', 'approved') RETURNING id INTO a_wrong_type;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status, expires_at)
  VALUES ('owner_payout', o, o, 100, 'USD', 'approved', now() - interval '1 hour') RETURNING id INTO a_expired;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o2, o2, 100, 'USD', 'approved') RETURNING id INTO a_other;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 100, 'NGN', 'approved') RETURNING id INTO a_cur;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 50, 'USD', 'approved') RETURNING id INTO a_amt;
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 100, 'USD', 'rejected') RETURNING id INTO a_rej;

  -- rejection cases
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, gen_random_uuid(), acct, 100, 'USD', 'paypal', 'idem-missing-1')->>'code') = 'authorization_not_found', 'missing authorization');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a_other, acct, 100, 'USD', 'paypal', 'idem-other-001')->>'code') = 'authorization_wrong_owner', 'other owner authorization');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a_wrong_type, acct, 100, 'USD', 'paypal', 'idem-type-0001')->>'code') = 'authorization_type_mismatch', 'wrong type');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a_expired, acct, 100, 'USD', 'paypal', 'idem-exp-00001')->>'code') = 'authorization_expired', 'expired');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a_rej, acct, 100, 'USD', 'paypal', 'idem-rej-00001')->>'code') = 'authorization_not_approved', 'rejected');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a_amt, acct, 100, 'USD', 'paypal', 'idem-amt-00001')->>'code') = 'authorization_amount_mismatch', 'amount mismatch');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct, 100, 'NGN', 'paypal', 'idem-cur-00001')->>'code') = 'invalid_account', 'currency vs account');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct2, 100, 'USD', 'paypal', 'idem-acct-0001')->>'code') = 'invalid_account', 'unowned account');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct, 100, 'USD', 'paypal', 'short')->>'code') = 'invalid_idempotency_key', 'idempotency key format');
  PERFORM pg_temp.assert((SELECT status FROM public.withdrawal_authorizations WHERE id = a1) = 'approved', 'rejections must not consume authorization');

  -- success + reservation before provider call
  r := public.create_owner_self_withdrawal(o, a1, acct, 100, 'USD', 'paypal', 'idem-success-01');
  PERFORM pg_temp.assert((r->>'ok')::boolean AND NOT (r->>'duplicate')::boolean, 'valid authorization succeeds');
  pid := (r->>'payout_id')::uuid;
  PERFORM pg_temp.assert((SELECT status FROM public.owner_payouts WHERE id = pid) = 'authorized', 'payout authorized');
  PERFORM pg_temp.assert((SELECT workflow_type FROM public.owner_payouts WHERE id = pid) = 'self_withdrawal', 'workflow classification');
  PERFORM pg_temp.assert((SELECT status FROM public.withdrawal_authorizations WHERE id = a1) = 'consumed', 'authorization consumed');
  PERFORM pg_temp.assert((SELECT consumed_reference FROM public.withdrawal_authorizations WHERE id = a1) = pid, 'authorization bound to payout');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.wallet_ledger_entries WHERE reference_id = pid AND entry_type = 'payout') = 1, 'exactly one reservation entry');
  PERFORM pg_temp.assert((SELECT available_balance FROM public.wallet_accounts WHERE user_id = o AND account_type = 'owner') = 400, 'wallet reserved');

  -- replay with same key returns the same payout; different amount with same key conflicts
  r2 := public.create_owner_self_withdrawal(o, a1, acct, 100, 'USD', 'paypal', 'idem-success-01');
  PERFORM pg_temp.assert((r2->>'duplicate')::boolean AND (r2->>'payout_id')::uuid = pid, 'idempotent replay');
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct, 99, 'USD', 'paypal', 'idem-success-01')->>'code') = 'idempotency_conflict', 'same key different amount');
  -- consumed authorization cannot be reused under a new key
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct, 100, 'USD', 'paypal', 'idem-success-02')->>'code') = 'authorization_not_approved', 'consumed authorization rejected');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.owner_payouts WHERE owner_id = o) = 1, 'single payout');

  -- provider attempt claim: exactly one winner
  PERFORM pg_temp.assert((public.claim_owner_payout_provider_attempt(pid)->>'claimed')::boolean, 'first claim wins');
  PERFORM pg_temp.assert(NOT (public.claim_owner_payout_provider_attempt(pid)->>'claimed')::boolean, 'second claim loses');

  -- ambiguous outcome keeps funds reserved and blocks claims
  PERFORM public.mark_owner_payout_reconciliation_required(pid, 'timeout');
  PERFORM pg_temp.assert((SELECT available_balance FROM public.wallet_accounts WHERE user_id = o AND account_type = 'owner') = 400, 'ambiguous keeps reservation');
  PERFORM pg_temp.assert((SELECT status FROM public.owner_payouts WHERE id = pid) = 'authorized', 'ambiguous stays non-terminal');

  -- wrong provider / amount evidence is rejected
  PERFORM pg_temp.assert(NOT (public.finalize_owner_payout(pid, 'settled', 'paystack')->>'ok')::boolean, 'provider mismatch');
  PERFORM pg_temp.assert(NOT (public.finalize_owner_payout(pid, 'settled', 'paypal', '{}', 5, 'USD')->>'ok')::boolean, 'amount mismatch');

  -- failure releases once; replay is a no-op
  PERFORM pg_temp.assert((public.finalize_owner_payout(pid, 'failed', 'paypal', '{"reason":"denied"}', 100, 'USD')->>'ok')::boolean, 'verified failure');
  PERFORM public.finalize_owner_payout(pid, 'failed', 'paypal', '{"reason":"denied"}', 100, 'USD');
  PERFORM pg_temp.assert((SELECT available_balance FROM public.wallet_accounts WHERE user_id = o AND account_type = 'owner') = 500, 'reservation released exactly once');
  PERFORM pg_temp.assert((SELECT count(*) FROM public.wallet_ledger_entries WHERE reference_id = pid AND entry_type = 'payout_reversal') = 1, 'single reversal entry');
  PERFORM pg_temp.assert((SELECT status FROM public.withdrawal_authorizations WHERE id = a1) = 'consumed', 'authorization stays consumed after failure');

  -- insufficient balance
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 900, 'USD', 'approved') RETURNING id INTO a1;
  PERFORM pg_temp.assert((public.create_owner_self_withdrawal(o, a1, acct, 900, 'USD', 'paypal', 'idem-insuff-001')->>'code') = 'insufficient_balance', 'insufficient balance');

  -- settlement: no second debit, replay no-op
  INSERT INTO public.withdrawal_authorizations(request_type, requested_by, subject_user_id, amount, currency, status)
  VALUES ('owner_payout', o, o, 100, 'USD', 'approved') RETURNING id INTO a1;
  r := public.create_owner_self_withdrawal(o, a1, acct, 100, 'USD', 'paypal', 'idem-settle-001');
  pid := (r->>'payout_id')::uuid;
  PERFORM public.claim_owner_payout_provider_attempt(pid);
  PERFORM pg_temp.assert((public.record_owner_payout_submitted(pid, 'BATCH1', 'PENDING')->>'status') = 'captured', 'submission is not settlement');
  PERFORM pg_temp.assert((SELECT status FROM public.owner_payouts WHERE id = pid) = 'captured', 'captured after submission');
  PERFORM pg_temp.assert((public.finalize_owner_payout(pid, 'settled', 'paypal', '{}', 100, 'USD')->>'status') = 'completed', 'settled');
  PERFORM pg_temp.assert((public.finalize_owner_payout(pid, 'settled', 'paypal', '{}', 100, 'USD')->>'duplicate')::boolean, 'settlement replay');
  PERFORM pg_temp.assert((SELECT available_balance FROM public.wallet_accounts WHERE user_id = o AND account_type = 'owner') = 400, 'no second debit on settlement');

  -- direct self-withdrawal insert without authorization is rejected
  BEGIN
    INSERT INTO public.owner_payouts(owner_id, payout_account_id, provider, amount, currency, workflow_type)
      VALUES (o, acct, 'paypal', 1, 'USD', 'self_withdrawal');
    RAISE EXCEPTION 'ASSERTION FAILED: self-withdrawal without authorization was inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- weekly worker eligibility
  INSERT INTO public.owner_payouts(owner_id, payout_account_id, provider, amount, currency, status, initiated_by, scheduled_for, workflow_type, reserved_at, transfer_reference)
    VALUES (o, acct, 'paypal', 10, 'USD', 'pending', 'cron', now() - interval '1 hour', 'weekly_bulk', now(), 'wk_unapproved') RETURNING id INTO pid;
  PERFORM pg_temp.assert(NOT (public.claim_weekly_owner_payout(pid)->>'claimed')::boolean, 'unapproved weekly payout not claimable');
  UPDATE public.owner_payouts SET weekly_approved_at = now() WHERE id = pid;
  UPDATE public.owner_payouts SET scheduled_for = now() + interval '1 day' WHERE id = pid;
  PERFORM pg_temp.assert(NOT (public.claim_weekly_owner_payout(pid)->>'claimed')::boolean, 'future-dated weekly payout not claimable');
  UPDATE public.owner_payouts SET scheduled_for = now() - interval '1 minute' WHERE id = pid;
  PERFORM pg_temp.assert((public.claim_weekly_owner_payout(pid)->>'claimed')::boolean, 'due approved weekly payout claimable');
  PERFORM pg_temp.assert(NOT (public.claim_weekly_owner_payout(pid)->>'claimed')::boolean, 'second worker cannot claim');
  -- a pending self-withdrawal can never be claimed by the weekly worker
  INSERT INTO public.owner_payouts(owner_id, payout_account_id, provider, amount, currency, status, initiated_by, scheduled_for, workflow_type, reserved_at, weekly_approved_at, authorization_id, transfer_reference)
    VALUES (o2, acct2, 'paypal', 10, 'USD', 'pending', 'owner', now() - interval '1 hour', 'self_withdrawal', now(), now(), a_other, 'sw_pending') RETURNING id INTO pid;
  PERFORM pg_temp.assert(NOT (public.claim_weekly_owner_payout(pid)->>'claimed')::boolean, 'self-withdrawal excluded from weekly claim');
END $$;

ROLLBACK;
