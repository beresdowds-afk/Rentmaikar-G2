
-- Per-tour, per-country step overrides
CREATE TABLE public.tour_step_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_name TEXT NOT NULL,
  country TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tour_name, country)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_step_configs TO authenticated;
GRANT ALL ON public.tour_step_configs TO service_role;

ALTER TABLE public.tour_step_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tour step configs"
  ON public.tour_step_configs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_tour_step_configs_updated_at
  BEFORE UPDATE ON public.tour_step_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tour analytics events
CREATE TABLE public.tour_analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('tour_start','tour_step_view','tour_complete')),
  tour_name TEXT NOT NULL,
  country TEXT NOT NULL,
  step_id TEXT,
  step_index INTEGER,
  total_steps INTEGER,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  extra JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tour_events_created_at ON public.tour_analytics_events (created_at DESC);
CREATE INDEX idx_tour_events_country_type ON public.tour_analytics_events (country, event_type, created_at DESC);
CREATE INDEX idx_tour_events_tour ON public.tour_analytics_events (tour_name, created_at DESC);

GRANT SELECT, INSERT ON public.tour_analytics_events TO authenticated;
GRANT SELECT, INSERT ON public.tour_analytics_events TO anon;
GRANT ALL ON public.tour_analytics_events TO service_role;

ALTER TABLE public.tour_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert their own tour events"
  ON public.tour_analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins can view tour events"
  ON public.tour_analytics_events FOR SELECT
  TO authenticated
  USING (public.is_admin());
