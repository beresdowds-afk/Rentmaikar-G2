CREATE OR REPLACE FUNCTION public.trg_settle_payment_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  BEGIN
    PERFORM public.settle_payment_financials(NEW.id, NEW.payment_method, NEW.transaction_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never block the payment record itself; surface for reconciliation.
    INSERT INTO public.admin_audit_log(admin_id, action, target_table, target_id, details)
    VALUES ('00000000-0000-0000-0000-000000000000', 'payment_settlement_failed', 'payments',
            NEW.id::text, jsonb_build_object('error', SQLERRM));
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_settle ON public.payments;
CREATE TRIGGER trg_payments_settle
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_settle_payment_financials();