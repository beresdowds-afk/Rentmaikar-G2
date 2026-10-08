ALTER TABLE public.owner_payouts
  ADD COLUMN IF NOT EXISTS authorization_id UUID
    REFERENCES public.withdrawal_authorizations(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_owner_payouts_authorization_id
  ON public.owner_payouts(authorization_id);
