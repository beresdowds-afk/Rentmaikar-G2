-- 1. Wallet accounts -----------------------------------------------------------
CREATE TABLE public.wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('driver','owner','platform','proxy')),
  currency text NOT NULL CHECK (currency IN ('USD','NGN')),
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_credits numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_debits numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_type, currency)
);

GRANT SELECT ON public.wallet_accounts TO authenticated;
GRANT ALL ON public.wallet_accounts TO service_role;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own wallet" ON public.wallet_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_wallet_accounts_updated_at
  BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Ledger entries (append-only) ----------------------------------------------
CREATE TABLE public.wallet_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD','NGN')),
  entry_type text NOT NULL CHECK (entry_type IN (
    'rental_payment','security_deposit','deposit_refund','platform_fee','owner_share',
    'subscription_training','subscription_insurance','subscription_roadside',
    'payout','payout_reversal','refund','late_fee','adjustment'
  )),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed')),
  balance_after numeric(14,2) NOT NULL,
  reference_table text,
  reference_id uuid,
  provider text,
  provider_reference text,
  idempotency_key text UNIQUE,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_ledger_wallet ON public.wallet_ledger_entries(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_user ON public.wallet_ledger_entries(user_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_ref ON public.wallet_ledger_entries(reference_table, reference_id);

GRANT SELECT ON public.wallet_ledger_entries TO authenticated;
GRANT ALL ON public.wallet_ledger_entries TO service_role;
ALTER TABLE public.wallet_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own ledger" ON public.wallet_ledger_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Append-only: block any UPDATE/DELETE even from service_role
CREATE OR REPLACE FUNCTION public.block_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger_entries is append-only; post a reversing entry instead';
END;
$$;

CREATE TRIGGER trg_wallet_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.wallet_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutation();

-- 3. Wallet resolution + posting -------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_wallet_account(
  _user_id uuid, _account_type text, _currency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.wallet_accounts(user_id, account_type, currency)
  VALUES (_user_id, _account_type, _currency)
  ON CONFLICT (user_id, account_type, currency) DO UPDATE SET updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_wallet_entry(
  _user_id uuid,
  _account_type text,
  _currency text,
  _direction text,
  _amount numeric,
  _entry_type text,
  _idempotency_key text DEFAULT NULL,
  _reference_table text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _provider text DEFAULT NULL,
  _provider_reference text DEFAULT NULL,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _status text DEFAULT 'posted'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wallet_id uuid;
  _existing public.wallet_ledger_entries%ROWTYPE;
  _new_available numeric(14,2);
  _new_pending numeric(14,2);
  _entry_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.wallet_ledger_entries WHERE idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate', true, 'entry_id', _existing.id, 'balance_after', _existing.balance_after);
    END IF;
  END IF;

  _wallet_id := public.ensure_wallet_account(_user_id, _account_type, _currency);

  -- lock the wallet row so concurrent postings serialize
  PERFORM 1 FROM public.wallet_accounts WHERE id = _wallet_id FOR UPDATE;

  SELECT available_balance, pending_balance INTO _new_available, _new_pending
  FROM public.wallet_accounts WHERE id = _wallet_id;

  IF _status = 'pending' THEN
    _new_pending := _new_pending + CASE WHEN _direction = 'credit' THEN _amount ELSE -_amount END;
  ELSE
    _new_available := _new_available + CASE WHEN _direction = 'credit' THEN _amount ELSE -_amount END;
  END IF;

  UPDATE public.wallet_accounts
  SET available_balance = _new_available,
      pending_balance = _new_pending,
      lifetime_credits = lifetime_credits + CASE WHEN _direction = 'credit' THEN _amount ELSE 0 END,
      lifetime_debits  = lifetime_debits  + CASE WHEN _direction = 'debit'  THEN _amount ELSE 0 END,
      updated_at = now()
  WHERE id = _wallet_id;

  INSERT INTO public.wallet_ledger_entries(
    wallet_id, user_id, direction, amount, currency, entry_type, status, balance_after,
    reference_table, reference_id, provider, provider_reference, idempotency_key,
    description, metadata, created_by
  ) VALUES (
    _wallet_id, _user_id, _direction, _amount, _currency, _entry_type, _status, _new_available,
    _reference_table, _reference_id, _provider, _provider_reference, _idempotency_key,
    _description, COALESCE(_metadata, '{}'::jsonb), auth.uid()
  ) RETURNING id INTO _entry_id;

  RETURN jsonb_build_object(
    'duplicate', false, 'entry_id', _entry_id,
    'wallet_id', _wallet_id,
    'available_balance', _new_available,
    'pending_balance', _new_pending
  );
END;
$$;

-- Reverse an existing entry by posting the mirror entry
CREATE OR REPLACE FUNCTION public.reverse_wallet_entry(_entry_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.wallet_ledger_entries%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.wallet_ledger_entries WHERE id = _entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger entry not found'; END IF;
  RETURN public.post_wallet_entry(
    e.user_id,
    (SELECT account_type FROM public.wallet_accounts WHERE id = e.wallet_id),
    e.currency,
    CASE WHEN e.direction = 'credit' THEN 'debit' ELSE 'credit' END,
    e.amount,
    'adjustment',
    'reversal:' || e.id::text,
    e.reference_table, e.reference_id, e.provider, e.provider_reference,
    COALESCE(_reason, 'Reversal of entry ' || e.id::text),
    jsonb_build_object('reverses_entry_id', e.id)
  );
END;
$$;

-- 4. Read helper for the app ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_wallet_summary(_currency text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', w.id,
    'account_type', w.account_type,
    'currency', w.currency,
    'available_balance', w.available_balance,
    'pending_balance', w.pending_balance,
    'lifetime_credits', w.lifetime_credits,
    'lifetime_debits', w.lifetime_debits,
    'status', w.status
  )), '[]'::jsonb)
  FROM public.wallet_accounts w
  WHERE w.user_id = auth.uid()
    AND (_currency IS NULL OR w.currency = _currency);
$$;

REVOKE ALL ON FUNCTION public.post_wallet_entry(uuid,text,text,text,numeric,text,text,text,uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_wallet_account(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_wallet_entry(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_ledger_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_entry(uuid,text,text,text,numeric,text,text,text,uuid,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_account(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_entry(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_wallet_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_summary(text) TO authenticated, service_role;