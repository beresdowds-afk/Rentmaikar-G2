
-- ============================================================
-- Paystack + Opay PSP integration + Owner Payouts
-- ============================================================

-- 1. Paystack transactions
CREATE TABLE public.paystack_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  access_code TEXT,
  authorization_url TEXT,
  channel TEXT,
  currency TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  gateway_response TEXT,
  failure_reason TEXT,
  rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.paystack_transactions TO authenticated;
GRANT ALL ON public.paystack_transactions TO service_role;
ALTER TABLE public.paystack_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view their own paystack transactions"
  ON public.paystack_transactions FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage paystack transactions"
  ON public.paystack_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_paystack_tx_rental ON public.paystack_transactions(rental_id);
CREATE INDEX idx_paystack_tx_driver ON public.paystack_transactions(driver_id);

CREATE TRIGGER trg_paystack_tx_updated
  BEFORE UPDATE ON public.paystack_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Opay transactions
CREATE TABLE public.opay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  order_no TEXT,
  cashier_url TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.opay_transactions TO authenticated;
GRANT ALL ON public.opay_transactions TO service_role;
ALTER TABLE public.opay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view their own opay transactions"
  ON public.opay_transactions FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage opay transactions"
  ON public.opay_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_opay_tx_rental ON public.opay_transactions(rental_id);
CREATE INDEX idx_opay_tx_driver ON public.opay_transactions(driver_id);

CREATE TRIGGER trg_opay_tx_updated
  BEFORE UPDATE ON public.opay_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Owner payout accounts (bank/paypal recipients)
CREATE TABLE public.owner_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paystack','paypal')),
  -- Paystack fields
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  recipient_code TEXT,
  currency TEXT NOT NULL,
  -- PayPal
  paypal_email TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_payout_accounts TO authenticated;
GRANT ALL ON public.owner_payout_accounts TO service_role;
ALTER TABLE public.owner_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their payout accounts"
  ON public.owner_payout_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE INDEX idx_payout_accounts_owner ON public.owner_payout_accounts(owner_id);

CREATE TRIGGER trg_payout_accounts_updated
  BEFORE UPDATE ON public.owner_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Owner payouts (ledger of transfer attempts)
CREATE TABLE public.owner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payout_account_id UUID REFERENCES public.owner_payout_accounts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('paystack','paypal')),
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  transfer_reference TEXT UNIQUE,
  transfer_code TEXT,
  initiated_by TEXT NOT NULL DEFAULT 'owner' CHECK (initiated_by IN ('owner','cron','admin')),
  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.owner_payouts TO authenticated;
GRANT ALL ON public.owner_payouts TO service_role;
ALTER TABLE public.owner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view their payouts"
  ON public.owner_payouts FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Owners initiate their payouts"
  ON public.owner_payouts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins update payouts"
  ON public.owner_payouts FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_owner_payouts_owner ON public.owner_payouts(owner_id);
CREATE INDEX idx_owner_payouts_status ON public.owner_payouts(status);

CREATE TRIGGER trg_owner_payouts_updated
  BEFORE UPDATE ON public.owner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
