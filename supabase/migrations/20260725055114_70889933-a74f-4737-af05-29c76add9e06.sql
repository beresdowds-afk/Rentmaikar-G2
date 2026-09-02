
-- Enforce official IoT device pricing on order creation to block price tampering.
CREATE OR REPLACE FUNCTION public.enforce_iot_order_official_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country TEXT;
  v_region  TEXT;
  v_price   NUMERIC;
  v_currency TEXT;
BEGIN
  -- Admins can set any price (e.g., manual adjustments).
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Owner's region from profile.
  SELECT preferred_country INTO v_country
    FROM public.profiles
    WHERE user_id = NEW.owner_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Cannot create IoT device order: owner region is not set on profile.';
  END IF;

  v_region := CASE upper(v_country)
                WHEN 'US' THEN 'usa'
                WHEN 'USA' THEN 'usa'
                WHEN 'NG' THEN 'nigeria'
                WHEN 'NGA' THEN 'nigeria'
                ELSE lower(v_country)
              END;

  SELECT price, currency INTO v_price, v_currency
    FROM public.iot_device_pricing
    WHERE lower(region) = v_region
    ORDER BY updated_at DESC
    LIMIT 1;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'No official IoT device pricing configured for region %', v_region;
  END IF;

  IF NEW.device_price IS DISTINCT FROM v_price
     OR upper(COALESCE(NEW.currency, '')) IS DISTINCT FROM upper(v_currency) THEN
    RAISE EXCEPTION 'IoT device price/currency does not match official pricing for region % (expected % %, got % %)',
      v_region, v_price, v_currency, NEW.device_price, NEW.currency;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_iot_order_official_price() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_iot_order_official_price_ins ON public.iot_device_orders;
CREATE TRIGGER enforce_iot_order_official_price_ins
BEFORE INSERT ON public.iot_device_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_iot_order_official_price();
