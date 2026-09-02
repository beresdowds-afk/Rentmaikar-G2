-- 1. Correlation IDs for end-to-end webhook tracing
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE public.payment_state_events ADD COLUMN IF NOT EXISTS correlation_id text;
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_correlation
  ON public.payment_webhook_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_payment_state_events_correlation
  ON public.payment_state_events(correlation_id);

-- 2. Disputes
CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_reference text,
  reason text,
  amount numeric(14,2),
  currency text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','escalated','resolved_merchant','resolved_customer','overridden')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_disputes_unique_ref
  ON public.payment_disputes(payment_id, COALESCE(provider_reference, ''));
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status
  ON public.payment_disputes(status, opened_at DESC);

GRANT SELECT ON public.payment_disputes TO authenticated;
GRANT ALL ON public.payment_disputes TO service_role;
ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage disputes"
  ON public.payment_disputes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "parties read own disputes"
  ON public.payment_disputes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_disputes.payment_id
        AND (p.driver_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE TRIGGER trg_payment_disputes_updated_at
  BEFORE UPDATE ON public.payment_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Record / escalate a dispute (service role + admins)
CREATE OR REPLACE FUNCTION public.record_payment_dispute(
  _payment_id uuid,
  _provider text,
  _provider_reference text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _amount numeric DEFAULT NULL,
  _currency text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.payment_disputes
    (payment_id, provider, provider_reference, reason, amount, currency, correlation_id)
  VALUES (_payment_id, _provider, _provider_reference, _reason, _amount, _currency, _correlation_id)
  ON CONFLICT (payment_id, COALESCE(provider_reference, '')) DO UPDATE
    SET reason = COALESCE(EXCLUDED.reason, public.payment_disputes.reason),
        amount = COALESCE(EXCLUDED.amount, public.payment_disputes.amount),
        currency = COALESCE(EXCLUDED.currency, public.payment_disputes.currency),
        correlation_id = COALESCE(EXCLUDED.correlation_id, public.payment_disputes.correlation_id),
        updated_at = now()
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_dispute(uuid,text,text,text,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_dispute(uuid,text,text,text,numeric,text,text) TO service_role;

-- 4. Admin resolution / override with automatic follow-up transitions
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  _dispute_id uuid,
  _resolution text,
  _notes text DEFAULT NULL,
  _override_state text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.payment_disputes%ROWTYPE;
  target_state text;
  new_status text;
  txn jsonb;
  e RECORD;
  reversed int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT * INTO d FROM public.payment_disputes WHERE id = _dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispute not found');
  END IF;

  IF d.status IN ('resolved_merchant','resolved_customer','overridden') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispute already closed', 'status', d.status);
  END IF;

  IF _resolution = 'merchant' THEN
    target_state := 'completed';
    new_status := 'resolved_merchant';
  ELSIF _resolution = 'customer' THEN
    target_state := 'refunded';
    new_status := 'resolved_customer';
  ELSIF _resolution = 'override' THEN
    target_state := COALESCE(_override_state, 'completed');
    new_status := 'overridden';
  ELSIF _resolution = 'escalate' THEN
    UPDATE public.payment_disputes
      SET status = 'escalated', resolution_notes = COALESCE(_notes, resolution_notes), updated_at = now()
      WHERE id = _dispute_id;
    PERFORM public.log_admin_action('dispute_escalated', 'payment_disputes', _dispute_id::text,
      jsonb_build_object('payment_id', d.payment_id, 'notes', _notes));
    RETURN jsonb_build_object('ok', true, 'status', 'escalated');
  ELSE
    RAISE EXCEPTION 'unknown resolution %', _resolution;
  END IF;

  txn := public.transition_payment_state(
    'payment', d.payment_id, target_state,
    COALESCE(_notes, 'dispute ' || _resolution),
    jsonb_build_object('dispute_id', _dispute_id, 'resolution', _resolution,
                       'correlation_id', d.correlation_id)
  );

  IF COALESCE((txn->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', txn->>'error', 'transition', txn);
  END IF;

  -- Money must follow the decision: a customer-favourable outcome reverses
  -- every ledger entry the original capture posted.
  IF target_state = 'refunded' THEN
    FOR e IN
      SELECT id FROM public.wallet_ledger_entries
      WHERE reference_table = 'payments' AND reference_id = d.payment_id AND status <> 'reversed'
    LOOP
      PERFORM public.reverse_wallet_entry(e.id, COALESCE(_notes, 'dispute resolved for customer'));
      reversed := reversed + 1;
    END LOOP;
    UPDATE public.payments SET status = 'refunded', failure_reason = COALESCE(_notes, 'dispute refund')
      WHERE id = d.payment_id;
  ELSE
    UPDATE public.payments SET status = target_state, failure_reason = NULL
      WHERE id = d.payment_id;
  END IF;

  UPDATE public.payment_disputes
    SET status = new_status,
        resolved_at = now(),
        resolved_by = auth.uid(),
        resolution_notes = COALESCE(_notes, resolution_notes),
        updated_at = now()
    WHERE id = _dispute_id;

  PERFORM public.log_admin_action('dispute_resolved', 'payment_disputes', _dispute_id::text,
    jsonb_build_object('payment_id', d.payment_id, 'resolution', _resolution,
                       'target_state', target_state, 'entries_reversed', reversed,
                       'notes', _notes, 'correlation_id', d.correlation_id));

  RETURN jsonb_build_object('ok', true, 'status', new_status,
                            'payment_state', target_state, 'entries_reversed', reversed);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid,text,text,text) TO authenticated, service_role;

-- 5. Admin listing with payment context
CREATE OR REPLACE FUNCTION public.admin_list_disputes(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'opened_at' DESC), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', d.id,
      'payment_id', d.payment_id,
      'provider', d.provider,
      'provider_reference', d.provider_reference,
      'reason', d.reason,
      'amount', d.amount,
      'currency', d.currency,
      'status', d.status,
      'opened_at', d.opened_at,
      'resolved_at', d.resolved_at,
      'resolution_notes', d.resolution_notes,
      'correlation_id', d.correlation_id,
      'payment_status', p.status,
      'payment_amount', p.amount,
      'driver_id', p.driver_id,
      'owner_id', p.owner_id
    ) AS row
    FROM public.payment_disputes d
    LEFT JOIN public.payments p ON p.id = d.payment_id
    WHERE (_status IS NULL OR d.status = _status)
    ORDER BY d.opened_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500))
  ) s;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_disputes(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_disputes(text,integer) TO authenticated, service_role;