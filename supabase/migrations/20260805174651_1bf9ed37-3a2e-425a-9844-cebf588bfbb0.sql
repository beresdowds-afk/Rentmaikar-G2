CREATE UNIQUE INDEX IF NOT EXISTS receipts_idempotency_key_uidx
  ON public.receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_idempotency_key_uidx
  ON public.invoices(idempotency_key) WHERE idempotency_key IS NOT NULL;