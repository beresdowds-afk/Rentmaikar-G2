
-- 1. Strong idempotency: (payment_method, transaction_id) uniqueness for reconciler-backfilled rows.
-- Partial index so historical rows without transaction_id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS payments_method_txn_unique
  ON public.payments (payment_method, transaction_id)
  WHERE transaction_id IS NOT NULL AND payment_method IS NOT NULL;

-- 2. reconciliation_runs
CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  since TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',      -- running | success | partial | error
  triggered_by TEXT NOT NULL DEFAULT 'cron',   -- cron | manual | test
  total_checked INTEGER NOT NULL DEFAULT 0,
  total_updated INTEGER NOT NULL DEFAULT 0,
  total_backfilled INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  per_psp JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  backfilled_payment_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  fatal_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reconciliation_runs TO authenticated;
GRANT ALL ON public.reconciliation_runs TO service_role;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliation runs"
  ON public.reconciliation_runs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS reconciliation_runs_started_at_idx
  ON public.reconciliation_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_runs_status_idx
  ON public.reconciliation_runs (status);

CREATE TRIGGER update_reconciliation_runs_updated_at
  BEFORE UPDATE ON public.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. reconciliation_alerts
CREATE TABLE IF NOT EXISTS public.reconciliation_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.reconciliation_runs(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,        -- errors_spike | backfill_spike | provider_down | rolling_backfill_spike
  severity TEXT NOT NULL DEFAULT 'warning',  -- info | warning | critical
  psp TEXT,                        -- paystack | opay | paypal | null when aggregate
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.reconciliation_alerts TO authenticated;
GRANT ALL ON public.reconciliation_alerts TO service_role;
ALTER TABLE public.reconciliation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliation alerts"
  ON public.reconciliation_alerts FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can acknowledge reconciliation alerts"
  ON public.reconciliation_alerts FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS reconciliation_alerts_created_at_idx
  ON public.reconciliation_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_alerts_unacked_idx
  ON public.reconciliation_alerts (acknowledged_at) WHERE acknowledged_at IS NULL;

CREATE TRIGGER update_reconciliation_alerts_updated_at
  BEFORE UPDATE ON public.reconciliation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
