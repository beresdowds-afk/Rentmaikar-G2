
-- Sequences for human-friendly numbering
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 100000;
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 100000;

-- ============ invoices ============
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT ('INV-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  invoice_type TEXT NOT NULL DEFAULT 'rental' CHECK (invoice_type IN ('rental','subscription','deposit','fee','adjustment','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','partial','void','overdue')),
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  region TEXT,
  description TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_date TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  pdf_url TEXT,
  recipient_email TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_driver ON public.invoices(driver_id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner ON public.invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_rental ON public.invoices(rental_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment ON public.invoices(payment_id);

GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO authenticated, service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "invoices_driver_select" ON public.invoices FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "invoices_owner_select" ON public.invoices FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- ============ receipts ============
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE DEFAULT ('RCP-' || to_char(now(),'YYYYMM') || '-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0')),
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','sent','void')),
  region TEXT,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  recipient_email TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_driver ON public.receipts(driver_id);
CREATE INDEX IF NOT EXISTS idx_receipts_owner ON public.receipts(owner_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON public.receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON public.receipts(invoice_id);

GRANT SELECT, INSERT, UPDATE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
GRANT USAGE ON SEQUENCE public.receipt_number_seq TO authenticated, service_role;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_admin_all" ON public.receipts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "receipts_driver_select" ON public.receipts FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "receipts_owner_select" ON public.receipts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- ============ invoice_activity_log ============
CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice','receipt')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  channel TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_activity_entity ON public.invoice_activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_created ON public.invoice_activity_log(created_at DESC);

GRANT SELECT ON public.invoice_activity_log TO authenticated;
GRANT ALL ON public.invoice_activity_log TO service_role;

ALTER TABLE public.invoice_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_admin_all" ON public.invoice_activity_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "activity_owner_select" ON public.invoice_activity_log FOR SELECT TO authenticated
  USING (
    (entity_type='invoice' AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=entity_id AND (i.driver_id=auth.uid() OR i.owner_id=auth.uid())))
    OR (entity_type='receipt' AND EXISTS (SELECT 1 FROM public.receipts r WHERE r.id=entity_id AND (r.driver_id=auth.uid() OR r.owner_id=auth.uid())))
  );

-- ============ updated_at triggers ============
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_receipts_updated_at BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Auto-log invoice/receipt lifecycle ============
CREATE OR REPLACE FUNCTION public.log_invoice_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN v_action := 'status_' || NEW.status;
    ELSIF NEW.sent_at IS DISTINCT FROM OLD.sent_at AND NEW.sent_at IS NOT NULL THEN v_action := 'sent';
    ELSIF NEW.paid_at IS DISTINCT FROM OLD.paid_at AND NEW.paid_at IS NOT NULL THEN v_action := 'paid';
    ELSE v_action := 'updated';
    END IF;
  END IF;
  INSERT INTO public.invoice_activity_log(entity_type, entity_id, action, actor_id, details)
  VALUES (
    CASE WHEN TG_TABLE_NAME='invoices' THEN 'invoice' ELSE 'receipt' END,
    NEW.id, v_action, auth.uid(),
    jsonb_build_object('status', NEW.status, 'op', TG_OP)
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_invoices AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_activity();
CREATE TRIGGER trg_log_receipts AFTER INSERT OR UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_activity();

-- ============ Auto-create receipt on completed payment ============
CREATE OR REPLACE FUNCTION public.auto_generate_receipt_from_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice_id UUID; v_receipt_id UUID;
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    -- Skip if a receipt already exists for this payment
    IF EXISTS (SELECT 1 FROM public.receipts WHERE payment_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Try to find matching open invoice
    SELECT id INTO v_invoice_id FROM public.invoices
      WHERE payment_id = NEW.id
         OR (rental_id = NEW.rental_id AND driver_id = NEW.driver_id AND status IN ('sent','draft','overdue','partial'))
      ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.receipts(payment_id, invoice_id, driver_id, owner_id, rental_id, vehicle_id, amount, currency, payment_method, transaction_id)
    VALUES (NEW.id, v_invoice_id, NEW.driver_id, NEW.owner_id, NEW.rental_id, NEW.vehicle_id,
            NEW.amount, COALESCE(NEW.currency,'USD'), NEW.payment_method, NEW.transaction_id)
    RETURNING id INTO v_receipt_id;

    IF v_invoice_id IS NOT NULL THEN
      UPDATE public.invoices
        SET status='paid', paid_at = COALESCE(paid_at, now()), payment_id = COALESCE(payment_id, NEW.id)
        WHERE id = v_invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_receipt ON public.payments;
CREATE TRIGGER trg_auto_receipt
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_receipt_from_payment();
