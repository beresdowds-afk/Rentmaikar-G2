CREATE TABLE public.paypal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  order_id text NOT NULL,
  capture_id text,
  payer_email text,
  payer_id text,
  status text NOT NULL DEFAULT 'created',
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  raw_order_response jsonb,
  raw_capture_response jsonb,
  failure_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paypal_transactions TO authenticated;
GRANT ALL ON public.paypal_transactions TO service_role;

ALTER TABLE public.paypal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own PayPal transactions"
  ON public.paypal_transactions
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "Owners can view PayPal transactions for their vehicles"
  ON public.paypal_transactions
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can manage all PayPal transactions"
  ON public.paypal_transactions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.update_paypal_transaction_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_paypal_transactions_updated_at
  BEFORE UPDATE ON public.paypal_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_paypal_transaction_updated_at();