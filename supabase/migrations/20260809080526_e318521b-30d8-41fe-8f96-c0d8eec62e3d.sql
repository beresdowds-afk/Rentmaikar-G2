-- 1. Read own messaging preferences (per channel) for the caller's profile phone
CREATE OR REPLACE FUNCTION public.get_my_messaging_preferences()
RETURNS TABLE (phone TEXT, channel TEXT, opted_out BOOLEAN, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone TEXT;
BEGIN
  SELECT p.phone INTO _phone FROM public.profiles p WHERE p.user_id = auth.uid();

  IF _phone IS NULL OR _phone = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT _phone,
         c.ch,
         public.is_messaging_opted_out(_phone, c.ch),
         (SELECT max(o.updated_at) FROM public.messaging_opt_outs o
           WHERE public.normalize_msisdn(o.phone) = public.normalize_msisdn(_phone)
             AND (o.channel = 'all' OR o.channel = c.ch))
  FROM (VALUES ('sms'), ('whatsapp')) AS c(ch);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_messaging_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_messaging_preferences() TO authenticated, service_role;

-- 2. Update own messaging preference for a single channel
CREATE OR REPLACE FUNCTION public.set_my_messaging_preference(_channel TEXT, _opted_out BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone TEXT;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _channel IS NULL OR _channel NOT IN ('sms', 'whatsapp') THEN
    RAISE EXCEPTION 'Channel must be sms or whatsapp';
  END IF;

  SELECT p.phone INTO _phone FROM public.profiles p WHERE p.user_id = _uid;

  IF public.normalize_msisdn(_phone) IS NULL THEN
    RAISE EXCEPTION 'Add and verify a phone number before changing messaging preferences';
  END IF;

  -- A blanket 'all' opt-out must be narrowed before a single channel can be re-enabled
  IF NOT _opted_out THEN
    UPDATE public.messaging_opt_outs o
      SET opted_in_at = now(), updated_at = now(), source = 'user_preferences'
      WHERE public.normalize_msisdn(o.phone) = public.normalize_msisdn(_phone)
        AND o.channel = 'all'
        AND o.opted_out_at IS NOT NULL
        AND (o.opted_in_at IS NULL OR o.opted_in_at < o.opted_out_at);
  END IF;

  INSERT INTO public.messaging_opt_outs AS o (phone, channel, user_id, opted_out_at, opted_in_at, source, last_keyword)
  VALUES (
    _phone, _channel, _uid,
    CASE WHEN _opted_out THEN now() ELSE NULL END,
    CASE WHEN _opted_out THEN NULL ELSE now() END,
    'user_preferences',
    CASE WHEN _opted_out THEN 'STOP' ELSE 'START' END
  )
  ON CONFLICT (phone, channel) DO UPDATE SET
    user_id = COALESCE(o.user_id, EXCLUDED.user_id),
    opted_out_at = CASE WHEN _opted_out THEN now() ELSE o.opted_out_at END,
    opted_in_at = CASE WHEN _opted_out THEN o.opted_in_at ELSE now() END,
    source = 'user_preferences',
    last_keyword = CASE WHEN _opted_out THEN 'STOP' ELSE 'START' END,
    updated_at = now();

  -- Keep the coarse profile flag in sync with SMS reachability
  IF _channel = 'sms' THEN
    UPDATE public.profiles SET notification_sms = NOT _opted_out WHERE user_id = _uid;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_messaging_preference(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_messaging_preference(TEXT, BOOLEAN) TO authenticated, service_role;

-- 3. Carry opt-out status over when a user changes their phone number
CREATE OR REPLACE FUNCTION public.transfer_messaging_opt_outs_on_phone_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.normalize_msisdn(NEW.phone) IS DISTINCT FROM public.normalize_msisdn(OLD.phone)
     AND public.normalize_msisdn(OLD.phone) IS NOT NULL
     AND public.normalize_msisdn(NEW.phone) IS NOT NULL THEN

    INSERT INTO public.messaging_opt_outs AS t (phone, channel, user_id, opted_out_at, opted_in_at, source, last_keyword)
    SELECT NEW.phone, o.channel, NEW.user_id, o.opted_out_at, o.opted_in_at, 'phone_change_transfer', o.last_keyword
    FROM public.messaging_opt_outs o
    WHERE public.normalize_msisdn(o.phone) = public.normalize_msisdn(OLD.phone)
    ON CONFLICT (phone, channel) DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, t.user_id),
      opted_out_at = GREATEST(COALESCE(EXCLUDED.opted_out_at, '-infinity'::timestamptz), COALESCE(t.opted_out_at, '-infinity'::timestamptz)) ,
      opted_in_at = GREATEST(COALESCE(EXCLUDED.opted_in_at, '-infinity'::timestamptz), COALESCE(t.opted_in_at, '-infinity'::timestamptz)),
      source = 'phone_change_transfer',
      updated_at = now();

    -- Detach the old number from the user; keep its record for compliance
    UPDATE public.messaging_opt_outs o
      SET user_id = NULL, updated_at = now()
      WHERE public.normalize_msisdn(o.phone) = public.normalize_msisdn(OLD.phone)
        AND o.user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_messaging_opt_outs_on_phone_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transfer_messaging_opt_outs ON public.profiles;
CREATE TRIGGER transfer_messaging_opt_outs
  AFTER UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.transfer_messaging_opt_outs_on_phone_change();