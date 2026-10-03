-- ============================================================================
-- Migration: 20261001100000_immutable_event_ledger.sql
-- Tier 2 Feature 32: Immutable Event Ledger (Server-Side Cryptographic Chaining)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.immutable_event_ledger (
  sequence_no bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  account_id uuid,
  reference_table text,
  reference_id text,
  direction text,
  amount numeric,
  currency text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  event_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_immutable_event_ledger_account
  ON public.immutable_event_ledger(account_id);

CREATE INDEX IF NOT EXISTS idx_immutable_event_ledger_event_type
  ON public.immutable_event_ledger(event_type);

CREATE INDEX IF NOT EXISTS idx_immutable_event_ledger_seq
  ON public.immutable_event_ledger(sequence_no DESC);

ALTER TABLE public.immutable_event_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view immutable event ledger" ON public.immutable_event_ledger;
CREATE POLICY "Admins can view immutable event ledger"
  ON public.immutable_event_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

DROP POLICY IF EXISTS "Users can view their own ledger entries" ON public.immutable_event_ledger;
CREATE POLICY "Users can view their own ledger entries"
  ON public.immutable_event_ledger
  FOR SELECT
  TO authenticated
  USING (account_id = auth.uid());

-- Authoritative RPC to append an immutable financial entry with cryptographic hash chaining
-- H(n) = SHA256(sequence + timestamp + event_type + account_id + reference + direction + amount + currency + previous_hash)
CREATE OR REPLACE FUNCTION public.append_immutable_ledger_entry(
  _event_type text,
  _account_id uuid,
  _reference_table text,
  _reference_id text,
  _direction text,
  _amount numeric,
  _currency text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_prev_hash text;
  v_event_hash text;
  v_canonical_str text;
  v_seq bigint;
BEGIN
  -- Obtain previous entry hash with advisory lock or sequential read
  SELECT event_hash
  INTO v_prev_hash
  FROM public.immutable_event_ledger
  ORDER BY sequence_no DESC
  LIMIT 1;

  v_prev_hash := COALESCE(v_prev_hash, 'GENESIS_FINANCIAL_LEDGER_ROOT_0000000000000000000000000000000000000000000000000000000000000000');

  -- Canonical hash payload
  v_canonical_str := v_event_id::text || ':' || v_now::text || ':' || _event_type || ':' || COALESCE(_account_id::text, 'system') || ':' || COALESCE(_reference_table, 'none') || ':' || COALESCE(_reference_id, 'none') || ':' || COALESCE(_direction, 'none') || ':' || COALESCE(_amount::text, '0') || ':' || COALESCE(_currency, 'USD') || ':' || v_prev_hash;
  v_event_hash := encode(digest(v_canonical_str, 'sha256'), 'hex');

  INSERT INTO public.immutable_event_ledger (
    event_id,
    occurred_at,
    event_type,
    account_id,
    reference_table,
    reference_id,
    direction,
    amount,
    currency,
    metadata,
    previous_hash,
    event_hash
  ) VALUES (
    v_event_id,
    v_now,
    _event_type,
    _account_id,
    _reference_table,
    _reference_id,
    _direction,
    _amount,
    _currency,
    _metadata,
    v_prev_hash,
    v_event_hash
  )
  RETURNING sequence_no INTO v_seq;

  RETURN jsonb_build_object(
    'sequence_no', v_seq,
    'event_id', v_event_id,
    'event_hash', v_event_hash,
    'previous_hash', v_prev_hash,
    'occurred_at', v_now
  );
END;
$$;
