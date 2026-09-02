
-- Payments table: tracks daily/weekly debit transactions
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rental_id UUID REFERENCES public.rentals(id),
  driver_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_frequency TEXT NOT NULL DEFAULT 'daily',
  payment_method TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL USING (is_admin());
CREATE POLICY "Drivers can view their own payments" ON public.payments FOR SELECT USING (driver_id = auth.uid());
CREATE POLICY "Owners can view payments for their vehicles" ON public.payments FOR SELECT USING (owner_id = auth.uid());

CREATE INDEX idx_payments_status_processed ON public.payments(status, processed_at);
CREATE INDEX idx_payments_driver_id ON public.payments(driver_id);

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Owner earnings / payout table
CREATE TABLE public.owner_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  rental_id UUID REFERENCES public.rentals(id),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payout_method TEXT,
  payout_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all earnings" ON public.owner_earnings FOR ALL USING (is_admin());
CREATE POLICY "Owners can view their own earnings" ON public.owner_earnings FOR SELECT USING (owner_id = auth.uid());

CREATE INDEX idx_owner_earnings_status ON public.owner_earnings(status);
CREATE INDEX idx_owner_earnings_owner_id ON public.owner_earnings(owner_id);

CREATE TRIGGER update_owner_earnings_updated_at BEFORE UPDATE ON public.owner_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
