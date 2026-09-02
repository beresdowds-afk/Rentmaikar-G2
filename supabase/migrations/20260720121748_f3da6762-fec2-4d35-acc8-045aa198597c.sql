
CREATE UNIQUE INDEX IF NOT EXISTS invoices_idempotency_key_unique
  ON public.invoices(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
