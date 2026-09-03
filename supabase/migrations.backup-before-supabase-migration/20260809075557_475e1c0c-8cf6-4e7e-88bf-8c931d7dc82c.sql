-- Phone-level opt-out registry (channel aware, works for unregistered numbers too)
CREATE TABLE public.messaging_opt_outs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'all',
  user_id UUID,
  opted_out_at TIMESTAMPTZ,
  opted_in_at TIMESTAMPTZ,
  source TEXT,
  last_keyword TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX messaging_opt_outs_phone_channel_idx
  ON public.messaging_opt_outs (phone, channel);
CREATE INDEX messaging_opt_outs_user_idx ON public.messaging_opt_outs (user_id);

GRANT SELECT ON public.messaging_opt_outs TO authenticated;
GRANT ALL ON public.messaging_opt_outs TO service_role;

ALTER TABLE public.messaging_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own opt-out records"
  ON public.messaging_opt_outs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER update_messaging_opt_outs_updated_at
  BEFORE UPDATE ON public.messaging_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.normalize_msisdn(_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_phone, ''), '[^0-9]', '', 'g'), '')
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_msisdn(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_msisdn(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_messaging_opted_out(_phone TEXT, _channel TEXT DEFAULT 'sms')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messaging_opt_outs o
    WHERE public.normalize_msisdn(o.phone) = public.normalize_msisdn(_phone)
      AND o.opted_out_at IS NOT NULL
      AND (o.opted_in_at IS NULL OR o.opted_in_at < o.opted_out_at)
      AND (o.channel = 'all' OR o.channel = _channel)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_messaging_opted_out(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_messaging_opted_out(TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_messaging_opt_out(
  _phone TEXT,
  _opted_out BOOLEAN,
  _channel TEXT DEFAULT 'all',
  _user_id UUID DEFAULT NULL,
  _source TEXT DEFAULT NULL,
  _keyword TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.normalize_msisdn(_phone) IS NULL THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  INSERT INTO public.messaging_opt_outs AS o (phone, channel, user_id, opted_out_at, opted_in_at, source, last_keyword)
  VALUES (
    _phone,
    COALESCE(_channel, 'all'),
    _user_id,
    CASE WHEN _opted_out THEN now() ELSE NULL END,
    CASE WHEN _opted_out THEN NULL ELSE now() END,
    _source,
    _keyword
  )
  ON CONFLICT (phone, channel) DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, o.user_id),
    opted_out_at = CASE WHEN _opted_out THEN now() ELSE o.opted_out_at END,
    opted_in_at = CASE WHEN _opted_out THEN o.opted_in_at ELSE now() END,
    source = COALESCE(EXCLUDED.source, o.source),
    last_keyword = COALESCE(EXCLUDED.last_keyword, o.last_keyword),
    updated_at = now();

  IF _user_id IS NOT NULL THEN
    UPDATE public.profiles
      SET notification_sms = NOT _opted_out
      WHERE user_id = _user_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_messaging_opt_out(TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_messaging_opt_out(TEXT, BOOLEAN, TEXT, UUID, TEXT, TEXT) TO service_role;

INSERT INTO public.messaging_opt_outs (phone, channel, user_id, opted_out_at, source, last_keyword)
SELECT p.phone, 'all', p.user_id, now(), 'backfill_profile_preference', 'STOP'
FROM public.profiles p
WHERE p.notification_sms = false AND p.phone IS NOT NULL AND p.phone <> ''
ON CONFLICT (phone, channel) DO NOTHING;