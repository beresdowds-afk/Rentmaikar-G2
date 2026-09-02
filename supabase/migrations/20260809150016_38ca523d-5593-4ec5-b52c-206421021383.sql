
CREATE TABLE IF NOT EXISTS public.provider_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text,
  event_type text NOT NULL DEFAULT 'usage',
  description text,
  quantity numeric,
  unit text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  period_start timestamptz,
  period_end timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'recorded',
  source text NOT NULL DEFAULT 'sync',
  vehicle_id uuid,
  device_id uuid,
  sim_id text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_at timestamptz,
  reconciled_by uuid,
  reconciliation_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_billing_events_provider_chk CHECK (provider IN ('traccar','emqx','hologram','persona','twilio','termii','resend','elevenlabs','paystack','paypal','opay','other')),
  CONSTRAINT provider_billing_events_status_chk CHECK (status IN ('recorded','reconciled','disputed','void')),
  CONSTRAINT provider_billing_events_event_type_chk CHECK (event_type IN ('usage','invoice','subscription','overage','credit','adjustment'))
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_billing_events_provider_external_uidx
  ON public.provider_billing_events (provider, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_billing_events_occurred_idx
  ON public.provider_billing_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS provider_billing_events_provider_idx
  ON public.provider_billing_events (provider, status);

GRANT SELECT ON public.provider_billing_events TO authenticated;
GRANT UPDATE ON public.provider_billing_events TO authenticated;
GRANT ALL ON public.provider_billing_events TO service_role;

ALTER TABLE public.provider_billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and IoT support can read provider billing events"
ON public.provider_billing_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin_assistant')
  OR public.has_role(auth.uid(), 'iot_support')
);

CREATE POLICY "Admins can reconcile provider billing events"
ON public.provider_billing_events FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provider_billing_events_updated_at
BEFORE UPDATE ON public.provider_billing_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.provider_billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  display_name text NOT NULL,
  billing_currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sync_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_detail text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_billing_accounts_provider_chk CHECK (provider IN ('traccar','emqx','hologram','persona','twilio','termii','resend','elevenlabs','paystack','paypal','opay','other'))
);

GRANT SELECT, UPDATE ON public.provider_billing_accounts TO authenticated;
GRANT ALL ON public.provider_billing_accounts TO service_role;

ALTER TABLE public.provider_billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and IoT support can read provider billing accounts"
ON public.provider_billing_accounts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'admin_assistant')
  OR public.has_role(auth.uid(), 'iot_support')
);

CREATE POLICY "Admins can update provider billing accounts"
ON public.provider_billing_accounts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provider_billing_accounts_updated_at
BEFORE UPDATE ON public.provider_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.provider_billing_accounts (provider, display_name, billing_currency)
VALUES
  ('traccar','Traccar Tracking','USD'),
  ('emqx','EMQX Broker','USD'),
  ('hologram','Hologram Connectivity','USD')
ON CONFLICT (provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_provider_billing_summary(
  _start timestamptz DEFAULT (now() - interval '30 days'),
  _end timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _providers jsonb;
  _revenue jsonb;
  _costs jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'admin_assistant')
    OR public.has_role(auth.uid(), 'iot_support')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'provider'), '[]'::jsonb) INTO _providers
  FROM (
    SELECT jsonb_build_object(
      'provider', e.provider,
      'currency', e.currency,
      'total_amount', round(sum(e.amount)::numeric, 2),
      'event_count', count(*),
      'unreconciled_count', count(*) FILTER (WHERE e.status = 'recorded'),
      'disputed_count', count(*) FILTER (WHERE e.status = 'disputed')
    ) AS x
    FROM public.provider_billing_events e
    WHERE e.occurred_at >= _start AND e.occurred_at <= _end AND e.status <> 'void'
    GROUP BY e.provider, e.currency
  ) s;

  SELECT coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) INTO _revenue
  FROM (
    SELECT l.currency, round(sum(CASE WHEN l.direction = 'credit' THEN l.amount ELSE -l.amount END)::numeric, 2) AS amt
    FROM public.wallet_ledger_entries l
    JOIN public.wallet_accounts w ON w.id = l.wallet_id
    WHERE w.account_type = 'platform'
      AND l.created_at >= _start AND l.created_at <= _end
    GROUP BY l.currency
  ) r;

  SELECT coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) INTO _costs
  FROM (
    SELECT e.currency, round(sum(e.amount)::numeric, 2) AS amt
    FROM public.provider_billing_events e
    WHERE e.occurred_at >= _start AND e.occurred_at <= _end AND e.status <> 'void'
    GROUP BY e.currency
  ) c;

  RETURN jsonb_build_object(
    'period_start', _start,
    'period_end', _end,
    'providers', _providers,
    'platform_revenue_by_currency', _revenue,
    'provider_cost_by_currency', _costs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provider_billing_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_billing_summary(timestamptz, timestamptz) TO authenticated;
