
-- ==================================================================
-- 1) Email delivery tracking + idempotency on invoices & receipts
-- ==================================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idem ON public.invoices(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_idem ON public.receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- One receipt per payment maximum
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique_payment ON public.receipts(payment_id) WHERE payment_id IS NOT NULL;

-- ==================================================================
-- 2) IoT sync scheduling (admin-configurable intervals)
-- ==================================================================
CREATE TABLE IF NOT EXISTS public.iot_sync_schedule (
  provider TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 1 AND 1440),
  last_updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iot_sync_schedule TO authenticated;
GRANT ALL ON public.iot_sync_schedule TO service_role;
ALTER TABLE public.iot_sync_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iot_sync_schedule_admin_all ON public.iot_sync_schedule;
CREATE POLICY iot_sync_schedule_admin_all ON public.iot_sync_schedule
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_iot_sync_schedule_updated ON public.iot_sync_schedule;
CREATE TRIGGER trg_iot_sync_schedule_updated BEFORE UPDATE ON public.iot_sync_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.iot_sync_schedule (provider, interval_minutes, enabled)
VALUES ('hologram', 60, false), ('traccar', 5, false)
ON CONFLICT (provider) DO NOTHING;

-- ==================================================================
-- 3) Traccar link safety — one device -> one vehicle
-- ==================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_iot_devices_one_vehicle
  ON public.iot_devices(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ==================================================================
-- 4) Payment webhook events log (audit + replay)
-- ==================================================================
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT,
  external_event_id TEXT,
  reference TEXT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received',
  signature_valid BOOLEAN,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pwe_provider_ref ON public.payment_webhook_events(provider, reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pwe_external_event_id ON public.payment_webhook_events(provider, external_event_id) WHERE external_event_id IS NOT NULL;

GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwe_admin_select ON public.payment_webhook_events;
CREATE POLICY pwe_admin_select ON public.payment_webhook_events
  FOR SELECT TO authenticated USING (public.is_admin());

-- ==================================================================
-- 5) Reconciliation view — mismatches between payments/invoices/receipts
-- ==================================================================
CREATE OR REPLACE VIEW public.billing_reconciliation_view AS
SELECT
  p.id AS payment_id,
  p.status AS payment_status,
  p.amount AS payment_amount,
  p.currency,
  p.transaction_id,
  p.processed_at,
  p.rental_id,
  p.driver_id,
  i.id AS invoice_id,
  i.invoice_number,
  i.status AS invoice_status,
  i.paid_at AS invoice_paid_at,
  r.id AS receipt_id,
  r.receipt_number,
  r.status AS receipt_status,
  CASE
    WHEN p.status = 'completed' AND r.id IS NULL THEN 'missing_receipt'
    WHEN p.status = 'completed' AND i.id IS NOT NULL AND i.status <> 'paid' THEN 'invoice_not_marked_paid'
    WHEN p.status <> 'completed' AND r.id IS NOT NULL THEN 'receipt_without_completed_payment'
    WHEN p.status = 'completed' AND r.id IS NOT NULL AND ABS(COALESCE(r.amount,0) - COALESCE(p.amount,0)) > 0.01 THEN 'amount_mismatch'
    ELSE 'ok'
  END AS discrepancy,
  p.created_at
FROM public.payments p
LEFT JOIN public.invoices i ON i.payment_id = p.id
LEFT JOIN public.receipts r ON r.payment_id = p.id;

GRANT SELECT ON public.billing_reconciliation_view TO authenticated;

-- ==================================================================
-- 6) Idempotent auto-receipt trigger from completed payments
--    (replaces prior body; marks linked invoice paid; safe to re-run)
-- ==================================================================
CREATE OR REPLACE FUNCTION public.auto_generate_receipt_from_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _idem TEXT;
  _rid UUID;
  _inv_id UUID;
BEGIN
  -- Only when transitioning INTO completed
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  _idem := 'auto-receipt-' || NEW.id::text;

  -- Idempotent insert (unique(idempotency_key) + unique(payment_id))
  INSERT INTO public.receipts(
    payment_id, driver_id, owner_id, rental_id, vehicle_id,
    amount, currency, payment_method, transaction_id, status,
    idempotency_key
  ) VALUES (
    NEW.id, NEW.driver_id, NEW.owner_id, NEW.rental_id, NEW.vehicle_id,
    NEW.amount, NEW.currency, NEW.payment_method, NEW.transaction_id, 'issued',
    _idem
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _rid;

  IF _rid IS NULL THEN
    SELECT id INTO _rid FROM public.receipts WHERE idempotency_key = _idem LIMIT 1;
  END IF;

  -- Mark any linked invoice paid
  SELECT id INTO _inv_id FROM public.invoices WHERE payment_id = NEW.id LIMIT 1;
  IF _inv_id IS NOT NULL THEN
    UPDATE public.invoices
       SET status = 'paid', paid_at = COALESCE(paid_at, now())
     WHERE id = _inv_id AND status <> 'paid';
  END IF;

  -- Best-effort activity log
  BEGIN
    INSERT INTO public.invoice_activity_log(entity_type, entity_id, action, actor_id, details)
    VALUES ('receipt', _rid, 'auto_generated', NULL,
            jsonb_build_object('payment_id', NEW.id, 'invoice_id', _inv_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;
