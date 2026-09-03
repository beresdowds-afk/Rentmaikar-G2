DROP INDEX IF EXISTS public.receipts_idempotency_key_uidx;
DROP INDEX IF EXISTS public.invoices_idempotency_key_uidx;
CREATE UNIQUE INDEX receipts_idempotency_key_uidx ON public.receipts(idempotency_key);
CREATE UNIQUE INDEX invoices_idempotency_key_uidx ON public.invoices(idempotency_key);