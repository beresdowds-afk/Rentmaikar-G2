-- ============================================================================
-- Migration: 20261001095000_system_audit_events.sql
-- Tier 2 Feature 31: Comprehensive System Audit Log (Authoritative Stream)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL,
  vector text NOT NULL CHECK (vector IN ('security', 'compliance', 'safety', 'financial', 'telematics', 'document', 'consent')),
  target_type text,
  target_id text,
  action text NOT NULL,
  status text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  previous_hash text,
  event_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_audit_events_vector_occurred
  ON public.system_audit_events(vector, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_audit_events_actor
  ON public.system_audit_events(actor_id);

CREATE INDEX IF NOT EXISTS idx_system_audit_events_target
  ON public.system_audit_events(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_system_audit_events_occurred
  ON public.system_audit_events(occurred_at DESC);

ALTER TABLE public.system_audit_events ENABLE ROW LEVEL SECURITY;

-- Append-only: No UPDATE or DELETE policies exist for anyone
DROP POLICY IF EXISTS "Admins can view system audit events" ON public.system_audit_events;
CREATE POLICY "Admins can view system audit events"
  ON public.system_audit_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

DROP POLICY IF EXISTS "Users can view audit events where they are actor" ON public.system_audit_events;
CREATE POLICY "Users can view audit events where they are actor"
  ON public.system_audit_events
  FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());

-- Authoritative security definer writer with cryptographic hash chaining
CREATE OR REPLACE FUNCTION public.append_system_audit_event(
  _actor_id uuid,
  _actor_role text,
  _event_type text,
  _vector text,
  _target_type text,
  _target_id text,
  _action text,
  _status text,
  _before_state jsonb DEFAULT NULL,
  _after_state jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _request_id text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_prev_hash text;
  v_event_hash text;
  v_canonical_str text;
  v_ip inet;
BEGIN
  -- Validate vector
  IF _vector NOT IN ('security', 'compliance', 'safety', 'financial', 'telematics', 'document', 'consent') THEN
    _vector := 'security';
  END IF;

  -- Safely parse IP address
  BEGIN
    IF _ip_address IS NOT NULL AND _ip_address <> '' THEN
      v_ip := _ip_address::inet;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  -- Retrieve hash of previous audit event
  SELECT event_hash
  INTO v_prev_hash
  FROM public.system_audit_events
  ORDER BY occurred_at DESC
  LIMIT 1;

  v_prev_hash := COALESCE(v_prev_hash, 'GENESIS_AUDIT_ROOT_0000000000000000000000000000000000000000000000000000000000000000');

  -- Canonical event digest string: ID + timestamp + actor + vector + action + status + target + previous_hash
  v_canonical_str := v_id::text || ':' || v_now::text || ':' || COALESCE(_actor_id::text, 'anon') || ':' || _vector || ':' || _action || ':' || _status || ':' || COALESCE(_target_id, 'none') || ':' || v_prev_hash;
  v_event_hash := encode(digest(v_canonical_str, 'sha256'), 'hex');

  INSERT INTO public.system_audit_events (
    id,
    occurred_at,
    actor_id,
    actor_role,
    event_type,
    vector,
    target_type,
    target_id,
    action,
    status,
    before_state,
    after_state,
    metadata,
    request_id,
    ip_address,
    user_agent,
    previous_hash,
    event_hash
  ) VALUES (
    v_id,
    v_now,
    _actor_id,
    _actor_role,
    _event_type,
    _vector,
    _target_type,
    _target_id,
    _action,
    _status,
    _before_state,
    _after_state,
    _metadata,
    _request_id,
    v_ip,
    _user_agent,
    v_prev_hash,
    v_event_hash
  );

  RETURN v_id;
END;
$$;
