
CREATE OR REPLACE FUNCTION public.get_owner_available_balance(
  _owner_id uuid,
  _currency text
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(amount) FROM public.owner_earnings
      WHERE owner_id = _owner_id
        AND currency = _currency
        AND status IN ('available','paid')  -- earned & released
    ), 0)
    -
    COALESCE((
      SELECT SUM(amount) FROM public.owner_payouts
      WHERE owner_id = _owner_id
        AND currency = _currency
        AND status IN ('pending','processing','completed')
    ), 0)
$$;

REVOKE ALL ON FUNCTION public.get_owner_available_balance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_available_balance(uuid, text) TO authenticated, service_role;
