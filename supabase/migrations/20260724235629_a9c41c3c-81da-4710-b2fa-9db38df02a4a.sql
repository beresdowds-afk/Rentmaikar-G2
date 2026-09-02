CREATE TABLE IF NOT EXISTS public.auth_event_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NULL, email text NULL, event_type text NOT NULL, provider text NULL, ip_address text NULL, user_agent text NULL, success boolean NOT NULL DEFAULT true, error_code text NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_auth_event_log_user ON public.auth_event_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_email ON public.auth_event_log(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_type ON public.auth_event_log(event_type, created_at DESC);
GRANT SELECT ON public.auth_event_log TO authenticated;
GRANT ALL ON public.auth_event_log TO service_role;
ALTER TABLE public.auth_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all auth events" ON public.auth_event_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Users read own auth events" ON public.auth_event_log FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_auth_event(_event_type text, _email text DEFAULT NULL, _provider text DEFAULT NULL, _success boolean DEFAULT true, _error_code text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _norm_email text := lower(nullif(trim(_email), ''));
BEGIN
  IF _event_type IS NULL OR length(_event_type) > 64 THEN RAISE EXCEPTION 'invalid event_type'; END IF;
  INSERT INTO public.auth_event_log(user_id, email, event_type, provider, success, error_code, metadata)
  VALUES (_uid, _norm_email, _event_type, nullif(_provider,''), coalesce(_success,true), nullif(_error_code,''), coalesce(_metadata,'{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.log_auth_event(text,text,text,boolean,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text,text,text,boolean,text,jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(_identifier text, _endpoint text, _max_requests integer DEFAULT 5, _window_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _window_start timestamptz := now() - make_interval(secs => _window_seconds); _current_count integer;
BEGIN
  IF _identifier IS NULL OR _endpoint IS NULL THEN RETURN true; END IF;
  IF _max_requests < 1 OR _max_requests > 1000 THEN _max_requests := 5; END IF;
  DELETE FROM public.rate_limit_log WHERE identifier = _identifier AND endpoint = _endpoint AND window_start < _window_start;
  SELECT COALESCE(SUM(request_count), 0) INTO _current_count FROM public.rate_limit_log WHERE identifier = _identifier AND endpoint = _endpoint AND window_start >= _window_start;
  IF _current_count >= _max_requests THEN RETURN false; END IF;
  INSERT INTO public.rate_limit_log(identifier, endpoint, request_count, window_start) VALUES (_identifier, _endpoint, 1, now());
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.check_auth_rate_limit(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text,text,integer,integer) TO anon, authenticated;