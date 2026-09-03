CREATE TABLE public.settlement_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  window_start timestamptz,
  window_end timestamptz,
  since_hours integer,
  payment_id uuid,
  triggered_by text NOT NULL DEFAULT 'cron',
  triggered_by_user_id uuid,
  status text NOT NULL DEFAULT 'running',
  total_checked integer NOT NULL DEFAULT 0,
  total_ok integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  total_repaired integer NOT NULL DEFAULT 0,
  per_provider jsonb NOT NULL DEFAULT '{}'::jsonb,
  fatal_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.settlement_reconciliation_runs TO authenticated;
GRANT ALL ON public.settlement_reconciliation_runs TO service_role;
ALTER TABLE public.settlement_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view settlement reconciliation runs"
  ON public.settlement_reconciliation_runs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.settlement_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.settlement_reconciliation_runs(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL,
  user_id uuid,
  provider text,
  provider_reference text,
  purpose text,
  amount numeric,
  currency text,
  ok boolean NOT NULL DEFAULT false,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  repaired jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.settlement_reconciliation_results TO authenticated;
GRANT ALL ON public.settlement_reconciliation_results TO service_role;
ALTER TABLE public.settlement_reconciliation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view settlement reconciliation results"
  ON public.settlement_reconciliation_results FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_srr_run_id ON public.settlement_reconciliation_results(run_id);
CREATE INDEX idx_srr_payment_id ON public.settlement_reconciliation_results(payment_id);
CREATE INDEX idx_srr_ok ON public.settlement_reconciliation_results(ok);
CREATE INDEX idx_srruns_started_at ON public.settlement_reconciliation_runs(started_at DESC);

CREATE TRIGGER trg_settlement_runs_updated_at
  BEFORE UPDATE ON public.settlement_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_notification_preferences
  ADD COLUMN IF NOT EXISTS sms boolean NOT NULL DEFAULT false;