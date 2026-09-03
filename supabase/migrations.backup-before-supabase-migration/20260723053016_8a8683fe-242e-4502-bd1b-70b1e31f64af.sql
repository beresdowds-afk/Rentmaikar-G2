-- Vehicle analytics events from Resident Orchestrator
CREATE TABLE public.vehicle_analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id text NOT NULL,
  category text NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'orchestrator',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vae_vehicle ON public.vehicle_analytics_events(vehicle_id, created_at DESC);
CREATE INDEX idx_vae_category ON public.vehicle_analytics_events(category, created_at DESC);

GRANT SELECT, INSERT ON public.vehicle_analytics_events TO authenticated;
GRANT ALL ON public.vehicle_analytics_events TO service_role;

ALTER TABLE public.vehicle_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage analytics events"
  ON public.vehicle_analytics_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners read analytics for their vehicles"
  ON public.vehicle_analytics_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id::text = vehicle_analytics_events.vehicle_id
        AND v.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role inserts analytics"
  ON public.vehicle_analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Independent verification state columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS persona_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referee_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_proxy_verified boolean NOT NULL DEFAULT false;

-- Backfill persona_verified from existing identity_verification_status
UPDATE public.profiles
   SET persona_verified = true
 WHERE identity_verification_status = 'verified'
   AND persona_verified = false;