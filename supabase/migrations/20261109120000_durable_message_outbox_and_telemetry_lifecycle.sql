-- Durable shared messaging state plus telemetry anomaly lifecycle/history.

CREATE TABLE IF NOT EXISTS public.outbound_message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  provider text,
  recipient text NOT NULL,
  template_reference text,
  message_class text NOT NULL DEFAULT 'transactional'
    CHECK (message_class IN ('authentication', 'transactional', 'operational')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'dispatching', 'accepted', 'delivered', 'simulated', 'failed', 'dead_letter', 'suppressed', 'expired')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  expires_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  provider_message_id text,
  queue_name text,
  queue_message_id bigint,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbound_message_outbox_due
  ON public.outbound_message_outbox (next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_outbound_message_outbox_provider_message
  ON public.outbound_message_outbox (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_message_outbox_status
  ON public.outbound_message_outbox (status, updated_at DESC);

ALTER TABLE public.outbound_message_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_message_outbox FROM anon, authenticated;
GRANT SELECT ON public.outbound_message_outbox TO authenticated;
GRANT ALL ON public.outbound_message_outbox TO service_role;
DROP POLICY IF EXISTS "Admins view outbound message outbox" ON public.outbound_message_outbox;
CREATE POLICY "Admins view outbound message outbox"
  ON public.outbound_message_outbox FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "Service role manages outbound message outbox" ON public.outbound_message_outbox;
CREATE POLICY "Service role manages outbound message outbox"
  ON public.outbound_message_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Keep the existing PGMQ queues authoritative for email dispatch while
-- recording the durable, idempotent application lifecycle in the same DB
-- transaction as enqueueing.
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, pg_temp
AS $$
DECLARE
  _payload jsonb := COALESCE(payload, '{}'::jsonb);
  _message_id text;
  _idempotency_key text;
  _outbox_id uuid;
  _queue_message_id bigint;
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'unsupported email queue';
  END IF;

  _message_id := COALESCE(NULLIF(_payload->>'message_id', ''), gen_random_uuid()::text);
  _idempotency_key := COALESCE(NULLIF(_payload->>'idempotency_key', ''), _message_id);
  _payload := jsonb_set(_payload, '{message_id}', to_jsonb(_message_id), true);

  INSERT INTO public.outbound_message_outbox (
    idempotency_key, channel, provider, recipient, template_reference,
    message_class, status, max_attempts, expires_at, queue_name, payload
  ) VALUES (
    'email:' || _idempotency_key,
    'email',
    'resend',
    COALESCE(_payload->>'to', ''),
    COALESCE(_payload->>'label', queue_name),
    CASE WHEN queue_name = 'auth_emails' THEN 'authentication' ELSE 'transactional' END,
    'queued',
    CASE WHEN queue_name = 'auth_emails' THEN 1 ELSE 5 END,
    CASE
      WHEN queue_name = 'auth_emails'
        THEN now() + make_interval(mins => LEAST(GREATEST(COALESCE((_payload->>'ttl_minutes')::integer, 15), 1), 15))
      ELSE now() + make_interval(mins => LEAST(GREATEST(COALESCE((_payload->>'ttl_minutes')::integer, 60), 1), 1440))
    END,
    queue_name,
    _payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _outbox_id;

  IF _outbox_id IS NULL THEN
    SELECT queue_message_id INTO _queue_message_id
      FROM public.outbound_message_outbox
     WHERE idempotency_key = 'email:' || _idempotency_key;
    IF _queue_message_id IS NOT NULL THEN
      RETURN _queue_message_id;
    END IF;
    RAISE EXCEPTION 'email message already exists without a queue receipt';
  END IF;

  BEGIN
    _queue_message_id := pgmq.send(queue_name, _payload);
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create(queue_name);
    _queue_message_id := pgmq.send(queue_name, _payload);
  END;

  UPDATE public.outbound_message_outbox
     SET queue_message_id = _queue_message_id, updated_at = now()
   WHERE id = _outbox_id;

  RETURN _queue_message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_outbound_message(_idempotency_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _claimed_id uuid;
BEGIN
  UPDATE public.outbound_message_outbox
     SET status = 'dispatching',
         attempt_count = attempt_count + 1,
         last_attempt_at = now(),
         claimed_at = now(),
         updated_at = now()
   WHERE idempotency_key = _idempotency_key
     AND (
       status IN ('queued', 'failed')
       OR (status = 'dispatching' AND claimed_at < now() - interval '10 minutes')
     )
     AND next_attempt_at <= now()
     AND attempt_count < max_attempts
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING id INTO _claimed_id;
  RETURN _claimed_id IS NOT NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_outbound_message(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message(text) TO service_role;

-- Claim SMS DLQ rows atomically so concurrent scheduled/manual reprocessors
-- cannot send the same message at the same time.
ALTER TABLE public.sms_dlq_retry_state
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.claim_sms_dlq_retry_batch(_limit integer DEFAULT 25)
RETURNS SETOF public.sms_dlq_retry_state
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT id
      FROM public.sms_dlq_retry_state
     WHERE resolved_at IS NULL
       AND paused = false
       AND attempts < max_attempts
       AND next_attempt_at <= now()
       AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
     ORDER BY next_attempt_at, created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 25), 100))
  )
  UPDATE public.sms_dlq_retry_state AS retry
     SET attempts = retry.attempts + 1,
         claimed_at = now(),
         updated_at = now()
    FROM candidates
   WHERE retry.id = candidates.id
  RETURNING retry.*;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_sms_dlq_retry_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sms_dlq_retry_batch(integer) TO service_role;

-- Anomaly lifecycle fields retain existing records and permit a single open
-- row per stable detector key, with a new row after resolution.
ALTER TABLE public.telemetry_anomalies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS active_dedupe_key text,
  ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS acknowledged_notes text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.telemetry_anomalies'::regclass
       AND conname = 'telemetry_anomalies_status_check'
  ) THEN
    ALTER TABLE public.telemetry_anomalies
      ADD CONSTRAINT telemetry_anomalies_status_check
      CHECK (status IN ('open', 'acknowledged', 'resolved'));
  END IF;
END;
$$;

UPDATE public.telemetry_anomalies
   SET status = CASE WHEN acknowledged THEN 'acknowledged' ELSE 'open' END,
       last_seen_at = COALESCE(last_seen_at, created_at)
 WHERE status = 'open' AND acknowledged = true;

UPDATE public.telemetry_anomalies
   SET active_dedupe_key = 'legacy:' || id::text,
       dedupe_key = COALESCE(dedupe_key, 'legacy:' || id::text)
 WHERE resolved_at IS NULL AND active_dedupe_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_anomalies_active_dedupe
  ON public.telemetry_anomalies (active_dedupe_key)
  WHERE active_dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_open_critical
  ON public.telemetry_anomalies (created_at)
  WHERE severity = 'critical' AND status <> 'resolved' AND escalated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies_vehicle_status
  ON public.telemetry_anomalies (vehicle_id, status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.telemetry_anomaly_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anomaly_id uuid NOT NULL REFERENCES public.telemetry_anomalies(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('detected', 'updated', 'acknowledged', 'resolved', 'escalated')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomaly_history_anomaly
  ON public.telemetry_anomaly_history (anomaly_id, created_at);
ALTER TABLE public.telemetry_anomaly_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telemetry_anomaly_history FROM anon, authenticated;
GRANT SELECT ON public.telemetry_anomaly_history TO authenticated;
GRANT ALL ON public.telemetry_anomaly_history TO service_role;
DROP POLICY IF EXISTS "Admins view telemetry anomaly history" ON public.telemetry_anomaly_history;
CREATE POLICY "Admins view telemetry anomaly history"
  ON public.telemetry_anomaly_history FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "Service role manages telemetry anomaly history" ON public.telemetry_anomaly_history;
CREATE POLICY "Service role manages telemetry anomaly history"
  ON public.telemetry_anomaly_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_telemetry_anomaly_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _event_type text;
  _actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event_type := 'detected';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'acknowledged' THEN
    _event_type := 'acknowledged';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'resolved' THEN
    _event_type := 'resolved';
  ELSIF OLD.escalated_at IS NULL AND NEW.escalated_at IS NOT NULL THEN
    _event_type := 'escalated';
  ELSE
    _event_type := 'updated';
  END IF;

  _actor := COALESCE(NEW.resolved_by, NEW.acknowledged_by, auth.uid());
  INSERT INTO public.telemetry_anomaly_history (anomaly_id, event_type, actor_id, details)
  VALUES (
    NEW.id,
    _event_type,
    _actor,
    jsonb_build_object(
      'severity', NEW.severity,
      'status', NEW.status,
      'occurrence_count', NEW.occurrence_count,
      'details', NEW.details
    )
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_telemetry_anomaly_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_telemetry_anomaly_history ON public.telemetry_anomalies;
CREATE TRIGGER trg_telemetry_anomaly_history
  AFTER INSERT OR UPDATE ON public.telemetry_anomalies
  FOR EACH ROW EXECUTE FUNCTION public.record_telemetry_anomaly_history();

CREATE OR REPLACE FUNCTION public.record_telemetry_anomaly(
  _vehicle_id uuid,
  _device_id uuid,
  _provider text,
  _anomaly_type text,
  _severity text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _dedupe_key text;
  _anomaly_id uuid;
BEGIN
  IF _anomaly_type IS NULL OR _anomaly_type = '' OR
     _severity IS NULL OR _severity NOT IN ('info', 'warning', 'critical') THEN
    RAISE EXCEPTION 'invalid telemetry anomaly';
  END IF;

  _dedupe_key := md5(COALESCE(_vehicle_id::text, _device_id::text, 'unknown') || ':' || _anomaly_type);
  INSERT INTO public.telemetry_anomalies (
    vehicle_id, device_id, provider, anomaly_type, severity, details,
    dedupe_key, active_dedupe_key, occurrence_count, last_seen_at, status
  ) VALUES (
    _vehicle_id, _device_id, _provider, _anomaly_type, _severity,
    COALESCE(_details, '{}'::jsonb), _dedupe_key, _dedupe_key, 1, now(), 'open'
  )
  ON CONFLICT (active_dedupe_key) WHERE active_dedupe_key IS NOT NULL
  DO UPDATE SET
    severity = CASE
      WHEN EXCLUDED.severity = 'critical' OR telemetry_anomalies.severity = 'critical' THEN 'critical'
      WHEN EXCLUDED.severity = 'warning' OR telemetry_anomalies.severity = 'warning' THEN 'warning'
      ELSE 'info'
    END,
    details = EXCLUDED.details,
    occurrence_count = telemetry_anomalies.occurrence_count + 1,
    last_seen_at = now()
  RETURNING id INTO _anomaly_id;
  RETURN _anomaly_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_telemetry_anomaly(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_telemetry_anomaly(uuid, uuid, text, text, text, jsonb) TO service_role;

-- Region and vehicle class may override these safe global freshness thresholds.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS telemetry_class text NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS public.fleet_telemetry_sla_config (
  region text NOT NULL,
  vehicle_class text NOT NULL,
  active_delayed_minutes integer NOT NULL DEFAULT 15 CHECK (active_delayed_minutes > 0),
  active_degraded_minutes integer NOT NULL DEFAULT 60 CHECK (active_degraded_minutes > 0),
  active_breach_minutes integer NOT NULL DEFAULT 360 CHECK (active_breach_minutes > 0),
  idle_delayed_minutes integer NOT NULL DEFAULT 120 CHECK (idle_delayed_minutes > 0),
  idle_degraded_minutes integer NOT NULL DEFAULT 360 CHECK (idle_degraded_minutes > 0),
  idle_breach_minutes integer NOT NULL DEFAULT 720 CHECK (idle_breach_minutes > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (region, vehicle_class),
  CHECK (active_delayed_minutes <= active_degraded_minutes
     AND active_degraded_minutes <= active_breach_minutes),
  CHECK (idle_delayed_minutes <= idle_degraded_minutes
     AND idle_degraded_minutes <= idle_breach_minutes)
);
INSERT INTO public.fleet_telemetry_sla_config (region, vehicle_class)
VALUES ('*', '*')
ON CONFLICT (region, vehicle_class) DO NOTHING;
ALTER TABLE public.fleet_telemetry_sla_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_telemetry_sla_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_telemetry_sla_config TO authenticated;
GRANT ALL ON public.fleet_telemetry_sla_config TO service_role;
DROP POLICY IF EXISTS "Admins manage fleet telemetry SLA config" ON public.fleet_telemetry_sla_config;
CREATE POLICY "Admins manage fleet telemetry SLA config"
  ON public.fleet_telemetry_sla_config FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Service role manages fleet telemetry SLA config" ON public.fleet_telemetry_sla_config;
CREATE POLICY "Service role manages fleet telemetry SLA config"
  ON public.fleet_telemetry_sla_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.telemetry_anomaly_threshold_config (
  region text NOT NULL,
  vehicle_class text NOT NULL,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(thresholds) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (region, vehicle_class)
);
INSERT INTO public.telemetry_anomaly_threshold_config (region, vehicle_class)
VALUES ('*', '*')
ON CONFLICT (region, vehicle_class) DO NOTHING;
ALTER TABLE public.telemetry_anomaly_threshold_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telemetry_anomaly_threshold_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_anomaly_threshold_config TO authenticated;
GRANT ALL ON public.telemetry_anomaly_threshold_config TO service_role;
DROP POLICY IF EXISTS "Admins manage telemetry anomaly thresholds" ON public.telemetry_anomaly_threshold_config;
CREATE POLICY "Admins manage telemetry anomaly thresholds"
  ON public.telemetry_anomaly_threshold_config FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Service role manages telemetry anomaly thresholds" ON public.telemetry_anomaly_threshold_config;
CREATE POLICY "Service role manages telemetry anomaly thresholds"
  ON public.telemetry_anomaly_threshold_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);
