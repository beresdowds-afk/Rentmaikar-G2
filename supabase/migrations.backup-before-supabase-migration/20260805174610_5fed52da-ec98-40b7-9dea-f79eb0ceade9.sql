ALTER TABLE public.paypal_transactions
  ALTER COLUMN owner_id DROP NOT NULL,
  ALTER COLUMN vehicle_id DROP NOT NULL;