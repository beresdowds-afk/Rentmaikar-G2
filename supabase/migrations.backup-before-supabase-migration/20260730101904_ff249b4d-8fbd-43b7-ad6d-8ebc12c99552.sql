
-- 1. Allowed regions: built-ins + ready/published Region Builder regions
CREATE OR REPLACE FUNCTION public.get_allowed_regions()
RETURNS TABLE (
  value text,
  label text,
  flag text,
  country_code text,
  currency text,
  currency_symbol text,
  phone_prefix text,
  built_in boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    VALUES
      ('USA'::text, 'United States'::text, '🇺🇸'::text, 'US'::text, 'USD'::text, '$'::text, '+1'::text, true),
      ('Nigeria', 'Nigeria', '🇳🇬', 'NG', 'NGN', '₦', '+234', true)
  ) AS b(value, label, flag, country_code, currency, currency_symbol, phone_prefix, built_in)
  UNION ALL
  SELECT
    btrim(rd.country_name),
    btrim(rd.country_name),
    COALESCE(NULLIF(btrim(rd.flag_emoji), ''), '🌍'),
    upper(COALESCE(rd.country_code, '')),
    upper(COALESCE(NULLIF(btrim(rd.currency), ''), 'USD')),
    COALESCE(NULLIF(btrim(rd.currency_symbol), ''), '$'),
    COALESCE(NULLIF(btrim(rd.phone_prefix), ''), ''),
    false
  FROM public.region_definitions rd
  WHERE rd.status IN ('ready', 'published')
    AND btrim(COALESCE(rd.country_name, '')) <> ''
    AND lower(btrim(rd.country_name)) NOT IN ('usa', 'nigeria')
    AND upper(COALESCE(rd.country_code, '')) NOT IN ('US', 'NG')
  ORDER BY 8 DESC, 2 ASC;
$$;

REVOKE ALL ON FUNCTION public.get_allowed_regions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_allowed_regions() TO anon, authenticated, service_role;

-- 2. Membership check
CREATE OR REPLACE FUNCTION public.is_allowed_region(_country text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_allowed_regions() r
    WHERE lower(r.value) = lower(btrim(COALESCE(_country, '')))
  );
$$;

REVOKE ALL ON FUNCTION public.is_allowed_region(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_allowed_region(text) TO anon, authenticated, service_role;

-- 3. Validated setter — single source of truth for web + mobile
CREATE OR REPLACE FUNCTION public.set_my_region(_country text, _mode text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _canonical text;
  _existing text;
  _is_admin boolean;
  _resolved_mode text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT r.value INTO _canonical
  FROM public.get_allowed_regions() r
  WHERE lower(r.value) = lower(btrim(COALESCE(_country, '')))
  LIMIT 1;

  IF _canonical IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'region_not_allowed', 'requested', _country);
  END IF;

  _resolved_mode := CASE WHEN _mode = 'auto' THEN 'auto' ELSE 'manual' END;

  _is_admin := public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'admin_assistant'::app_role);

  SELECT preferred_country INTO _existing FROM public.profiles WHERE user_id = _uid;

  -- Non-admins are locked to their registration region once it is set.
  IF NOT _is_admin AND _existing IS NOT NULL AND btrim(_existing) <> ''
     AND lower(_existing) <> lower(_canonical) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'region_locked', 'locked_to', _existing
    );
  END IF;

  UPDATE public.profiles
     SET preferred_country = _canonical,
         region_mode = CASE WHEN _is_admin THEN _resolved_mode ELSE 'manual' END,
         updated_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object(
    'ok', true,
    'country', _canonical,
    'region_mode', CASE WHEN _is_admin THEN _resolved_mode ELSE 'manual' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_region(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_region(text, text) TO authenticated, service_role;
