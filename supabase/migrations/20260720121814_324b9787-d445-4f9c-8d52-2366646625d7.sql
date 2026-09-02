
DROP INDEX IF EXISTS public.invoices_idempotency_key_unique;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_idempotency_key_key UNIQUE (idempotency_key);
