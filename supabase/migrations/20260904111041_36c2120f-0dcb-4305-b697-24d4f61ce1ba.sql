-- 1. Agent presence: which staff browsers are registered and ready to take calls
CREATE TABLE IF NOT EXISTS public.voip_agent_presence (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  region TEXT NOT NULL DEFAULT 'All',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voip_agent_presence TO authenticated;
GRANT ALL ON public.voip_agent_presence TO service_role;
ALTER TABLE public.voip_agent_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own presence"
  ON public.voip_agent_presence FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all presence"
  ON public.voip_agent_presence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Outbound caller-ID routing: which Twilio number a staff member dials out with
CREATE TABLE IF NOT EXISTS public.voip_outbound_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  label TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'All',
  role public.app_role NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voip_outbound_numbers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.voip_outbound_numbers TO authenticated;
GRANT ALL ON public.voip_outbound_numbers TO service_role;
ALTER TABLE public.voip_outbound_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff read outbound numbers"
  ON public.voip_outbound_numbers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage outbound numbers"
  ON public.voip_outbound_numbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Presence heartbeat used by the browser softphone
CREATE OR REPLACE FUNCTION public.voip_set_presence(_status TEXT, _region TEXT DEFAULT 'All')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _status NOT IN ('available', 'busy', 'offline') THEN
    RAISE EXCEPTION 'Invalid presence status';
  END IF;

  INSERT INTO public.voip_agent_presence (user_id, identity, status, region, last_seen_at, updated_at)
  VALUES (auth.uid(), 'user_' || auth.uid()::text, _status, COALESCE(_region, 'All'), now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET status = EXCLUDED.status,
        region = EXCLUDED.region,
        last_seen_at = now(),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.voip_set_presence(TEXT, TEXT) TO authenticated;

-- 4. Resolve which caller ID a staff member should dial out with
CREATE OR REPLACE FUNCTION public.voip_resolve_outbound_number(_user_id UUID, _region TEXT DEFAULT 'USA')
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.phone_number
  FROM public.voip_outbound_numbers n
  WHERE n.is_active
    AND (n.region = 'All' OR n.region = COALESCE(_region, 'USA'))
    AND (
      n.role IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user_id AND ur.role = n.role
      )
    )
  ORDER BY
    (n.role IS NOT NULL) DESC,
    (n.region <> 'All') DESC,
    n.is_default DESC,
    n.priority ASC,
    n.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.voip_resolve_outbound_number(UUID, TEXT) TO authenticated, service_role;

-- 5. Seed the two live Twilio numbers as the default outbound routes
INSERT INTO public.voip_outbound_numbers (phone_number, label, region, role, priority, is_default)
SELECT '+13806003018', 'Staff dial-out (default)', 'All', NULL, 100, true
WHERE NOT EXISTS (SELECT 1 FROM public.voip_outbound_numbers);
