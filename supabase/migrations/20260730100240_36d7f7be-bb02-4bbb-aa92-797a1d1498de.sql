ALTER TABLE public.owner_payouts DROP CONSTRAINT IF EXISTS owner_payouts_status_check;

ALTER TABLE public.owner_payouts
  ADD CONSTRAINT owner_payouts_status_check CHECK (status IN (
    'pending','authorized','captured','settled','available',
    'completed','failed','refunded','disputed','cancelled','processing'
  ));

CREATE OR REPLACE FUNCTION public.stamp_owner_payout_processed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed','failed','refunded','cancelled')
     AND NEW.processed_at IS NULL THEN
    NEW.processed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_payouts_processed_at ON public.owner_payouts;
CREATE TRIGGER trg_owner_payouts_processed_at
  BEFORE UPDATE OF status ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_owner_payout_processed_at();

REVOKE ALL ON FUNCTION public.stamp_owner_payout_processed_at() FROM PUBLIC, anon, authenticated;