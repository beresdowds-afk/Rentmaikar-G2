-- Mark payments funded by a driver's proxy payer. The payment still belongs to
-- the driver (so settlement credits the driver's account); these columns record
-- who actually paid and let webhooks verify the payer.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payer_type TEXT NOT NULL DEFAULT 'driver'
    CHECK (payer_type IN ('driver','proxy')),
  ADD COLUMN IF NOT EXISTS proxy_account_id UUID
    REFERENCES public.driver_proxy_billing_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_proxy_payer_requires_account;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_proxy_payer_requires_account
  CHECK (payer_type <> 'proxy' OR proxy_account_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS payments_by_proxy_account
  ON public.payments (proxy_account_id) WHERE proxy_account_id IS NOT NULL;
