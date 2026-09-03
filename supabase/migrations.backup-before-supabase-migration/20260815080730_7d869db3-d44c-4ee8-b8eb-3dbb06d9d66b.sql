
CREATE OR REPLACE FUNCTION public.admin_scan_settlement_integrity(
  _since timestamptz DEFAULT (now() - interval '7 days'),
  _limit int DEFAULT 200)
RETURNS TABLE(payment_id uuid, user_id uuid, purpose text, amount numeric,
              currency text, settled_at timestamptz, report jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'admin_assistant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.driver_id, p.purpose, p.amount, p.currency, p.settled_at,
         public.verify_payment_settlement(p.id) AS report
    FROM public.payments p
   WHERE p.status = 'completed'
     AND p.created_at >= _since
   ORDER BY p.created_at DESC
   LIMIT least(greatest(_limit, 1), 1000);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_scan_settlement_integrity(timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_scan_settlement_integrity(timestamptz, int) TO authenticated, service_role;
