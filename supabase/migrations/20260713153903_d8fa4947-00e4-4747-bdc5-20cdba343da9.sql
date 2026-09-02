
CREATE TABLE IF NOT EXISTS public.application_pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('notify_referees','verify_referees','auto_submit_for_review')),
  status TEXT NOT NULL CHECK (status IN ('started','success','error')),
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.application_pipeline_events TO authenticated;
GRANT ALL ON public.application_pipeline_events TO service_role;

ALTER TABLE public.application_pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view pipeline events"
  ON public.application_pipeline_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role inserts pipeline events"
  ON public.application_pipeline_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ape_app ON public.application_pipeline_events(application_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ape_created ON public.application_pipeline_events(created_at DESC);

CREATE OR REPLACE VIEW public.latest_application_pipeline_status
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (application_id, event_type)
  application_id, event_type, status, message, details, actor_id, created_at
FROM public.application_pipeline_events
ORDER BY application_id, event_type, created_at DESC;

GRANT SELECT ON public.latest_application_pipeline_status TO authenticated;
