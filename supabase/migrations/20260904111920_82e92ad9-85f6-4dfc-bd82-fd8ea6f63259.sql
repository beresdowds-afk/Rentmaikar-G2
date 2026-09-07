CREATE SEQUENCE IF NOT EXISTS public.support_case_number_seq START 1000;

CREATE TABLE public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE DEFAULT ('CASE-' || lpad(nextval('public.support_case_number_seq')::text, 6, '0')),
  subject text NOT NULL DEFAULT 'Customer interaction',
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  region text NOT NULL DEFAULT 'USA',
  origin_channel text NOT NULL DEFAULT 'call',
  customer_user_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  assigned_to uuid,
  call_id uuid REFERENCES public.voip_calls(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.inbox_conversations(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_cases_status_check CHECK (status = ANY (ARRAY['open','assigned','in_progress','waiting_customer','resolved','closed'])),
  CONSTRAINT support_cases_priority_check CHECK (priority = ANY (ARRAY['low','normal','high','urgent'])),
  CONSTRAINT support_cases_origin_check CHECK (origin_channel = ANY (ARRAY['call','sms','whatsapp','email','portal','manual']))
);

CREATE INDEX idx_support_cases_status ON public.support_cases(status);
CREATE INDEX idx_support_cases_customer ON public.support_cases(customer_user_id);
CREATE INDEX idx_support_cases_phone ON public.support_cases(customer_phone);
CREATE INDEX idx_support_cases_call ON public.support_cases(call_id);
CREATE INDEX idx_support_cases_conversation ON public.support_cases(conversation_id);
CREATE INDEX idx_support_cases_last_activity ON public.support_cases(last_activity_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_cases TO authenticated;
GRANT ALL ON public.support_cases TO service_role;
GRANT USAGE ON SEQUENCE public.support_case_number_seq TO authenticated, service_role;
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all cases" ON public.support_cases
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Customers view own cases" ON public.support_cases
  FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text,
  author_role text NOT NULL DEFAULT 'admin',
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_notes_author_role_check CHECK (author_role = ANY (ARRAY['admin','customer','system']))
);

CREATE INDEX idx_case_notes_case ON public.case_notes(case_id, created_at DESC);

GRANT SELECT, INSERT ON public.case_notes TO authenticated;
GRANT ALL ON public.case_notes TO service_role;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage case notes" ON public.case_notes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Customers read shared notes" ON public.case_notes
  FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_cases c
      WHERE c.id = case_notes.case_id AND c.customer_user_id = auth.uid()
    )
  );

CREATE POLICY "Customers add own replies" ON public.case_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_internal = false
    AND author_role = 'customer'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_cases c
      WHERE c.id = case_notes.case_id AND c.customer_user_id = auth.uid()
    )
  );

CREATE TABLE public.case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_events_case ON public.case_events(case_id, created_at DESC);

GRANT SELECT, INSERT ON public.case_events TO authenticated;
GRANT ALL ON public.case_events TO service_role;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage case events" ON public.case_events
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Customers read own case events" ON public.case_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_cases c
    WHERE c.id = case_events.case_id AND c.customer_user_id = auth.uid()
  ));

ALTER TABLE public.inbox_conversations ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.support_cases(id) ON DELETE SET NULL;
ALTER TABLE public.voip_calls ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.support_cases(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.touch_support_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('resolved','closed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_cases_touch
BEFORE UPDATE ON public.support_cases
FOR EACH ROW EXECUTE FUNCTION public.touch_support_case();

CREATE OR REPLACE FUNCTION public.bump_case_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_cases
  SET last_activity_at = now()
  WHERE id = NEW.case_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_case_notes_activity
AFTER INSERT ON public.case_notes
FOR EACH ROW EXECUTE FUNCTION public.bump_case_activity();

CREATE TRIGGER trg_case_events_activity
AFTER INSERT ON public.case_events
FOR EACH ROW EXECUTE FUNCTION public.bump_case_activity();

-- Create (or reuse) a case for a call log entry.
CREATE OR REPLACE FUNCTION public.case_for_call(p_call_id uuid, p_subject text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.voip_calls%ROWTYPE;
  v_case_id uuid;
BEGIN
  SELECT * INTO v_call FROM public.voip_calls WHERE id = p_call_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call not found';
  END IF;
  IF v_call.case_id IS NOT NULL THEN
    RETURN v_call.case_id;
  END IF;

  INSERT INTO public.support_cases (subject, status, region, origin_channel, customer_user_id, assigned_to, call_id, description)
  VALUES (
    COALESCE(p_subject, 'Call on ' || to_char(COALESCE(v_call.started_at, v_call.created_at), 'YYYY-MM-DD HH24:MI')),
    'open',
    v_call.region,
    'call',
    COALESCE(v_call.receiver_id, v_call.initiated_by),
    v_call.answered_by,
    v_call.id,
    'Case opened from ' || v_call.direction || ' call.'
  )
  RETURNING id INTO v_case_id;

  UPDATE public.voip_calls SET case_id = v_case_id WHERE id = v_call.id;

  INSERT INTO public.case_events (case_id, event_type, description, actor_id, metadata)
  VALUES (v_case_id, 'case_created', 'Case created from call log entry', auth.uid(),
          jsonb_build_object('call_id', v_call.id, 'call_sid', v_call.call_sid));

  RETURN v_case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.case_for_call(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_for_call(uuid, text) TO authenticated, service_role;

-- Create (or reuse) a case for an inbound SMS/WhatsApp conversation.
CREATE OR REPLACE FUNCTION public.case_for_conversation(
  p_conversation_id uuid,
  p_channel text DEFAULT 'sms',
  p_subject text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv public.inbox_conversations%ROWTYPE;
  v_case_id uuid;
BEGIN
  SELECT * INTO v_conv FROM public.inbox_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;
  IF v_conv.case_id IS NOT NULL THEN
    RETURN v_conv.case_id;
  END IF;

  SELECT id INTO v_case_id
  FROM public.support_cases
  WHERE customer_phone IS NOT NULL
    AND customer_phone = v_conv.user_phone
    AND status NOT IN ('resolved','closed')
  ORDER BY last_activity_at DESC
  LIMIT 1;

  IF v_case_id IS NULL THEN
    INSERT INTO public.support_cases (subject, region, origin_channel, customer_user_id, customer_name, customer_phone, customer_email, conversation_id, description)
    VALUES (
      COALESCE(p_subject, COALESCE(v_conv.subject, initcap(p_channel) || ' conversation')),
      v_conv.region,
      CASE WHEN p_channel = 'whatsapp' THEN 'whatsapp' ELSE 'sms' END,
      v_conv.user_id,
      v_conv.user_name,
      v_conv.user_phone,
      v_conv.user_email,
      v_conv.id,
      'Case opened from inbound ' || p_channel || ' message.'
    )
    RETURNING id INTO v_case_id;
  END IF;

  UPDATE public.inbox_conversations SET case_id = v_case_id WHERE id = v_conv.id;
  UPDATE public.support_cases SET conversation_id = COALESCE(conversation_id, v_conv.id) WHERE id = v_case_id;

  INSERT INTO public.case_events (case_id, event_type, description, metadata)
  VALUES (v_case_id, 'message_received', 'Inbound ' || p_channel || ' message linked to case',
          jsonb_build_object('conversation_id', v_conv.id, 'channel', p_channel));

  RETURN v_case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.case_for_conversation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_for_conversation(uuid, text, text) TO authenticated, service_role;

-- Customer reply from the portal.
CREATE OR REPLACE FUNCTION public.customer_reply_to_case(p_case_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.support_cases%ROWTYPE;
  v_note_id uuid;
  v_name text;
BEGIN
  SELECT * INTO v_case FROM public.support_cases WHERE id = p_case_id;
  IF NOT FOUND OR v_case.customer_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Case not found';
  END IF;
  IF length(coalesce(trim(p_body), '')) = 0 THEN
    RAISE EXCEPTION 'Reply cannot be empty';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.case_notes (case_id, author_id, author_name, author_role, body, is_internal)
  VALUES (p_case_id, auth.uid(), v_name, 'customer', left(p_body, 4000), false)
  RETURNING id INTO v_note_id;

  INSERT INTO public.case_events (case_id, event_type, description, actor_id)
  VALUES (p_case_id, 'customer_reply', 'Customer replied from the portal', auth.uid());

  IF v_case.status IN ('waiting_customer','resolved') THEN
    UPDATE public.support_cases SET status = 'in_progress' WHERE id = p_case_id;
  END IF;

  RETURN v_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_reply_to_case(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_reply_to_case(uuid, text) TO authenticated;