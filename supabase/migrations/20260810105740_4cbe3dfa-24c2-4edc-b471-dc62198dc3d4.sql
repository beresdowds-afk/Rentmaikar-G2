CREATE TABLE public.iot_sync_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iot_sync_activity_level_chk CHECK (level IN ('info','warn','error'))
);

CREATE INDEX idx_iot_sync_activity_created ON public.iot_sync_activity_log (created_at DESC);
CREATE INDEX idx_iot_sync_activity_provider ON public.iot_sync_activity_log (provider, created_at DESC);

GRANT SELECT ON public.iot_sync_activity_log TO authenticated;
GRANT ALL ON public.iot_sync_activity_log TO service_role;

ALTER TABLE public.iot_sync_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "IoT staff view sync activity"
ON public.iot_sync_activity_log
FOR SELECT
TO authenticated
USING (public.is_admin() OR public.has_role(auth.uid(), 'iot_support'::public.app_role));
