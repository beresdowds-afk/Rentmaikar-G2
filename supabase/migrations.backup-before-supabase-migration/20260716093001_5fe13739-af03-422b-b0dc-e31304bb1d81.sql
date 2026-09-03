
-- Remove overly-permissive UPDATE policies. Signing now goes through
-- SECURITY DEFINER RPCs that only touch the caller's own signature columns.

DROP POLICY IF EXISTS "Drivers can update their signature" ON public.legal_agreements;
DROP POLICY IF EXISTS "Owners can update their signature"  ON public.legal_agreements;

DROP POLICY IF EXISTS "Drivers can update their signature" ON public.rent_to_own_agreements;
DROP POLICY IF EXISTS "Owners can update their signature"  ON public.rent_to_own_agreements;

-- Drivers do not need direct UPDATE on rentals from the client; edge functions
-- (service_role) handle return_reminder_sent / extension_requested.
DROP POLICY IF EXISTS "Drivers can update their active rentals" ON public.rentals;

-- ---------- Signing RPCs ----------

CREATE OR REPLACE FUNCTION public.sign_legal_agreement(
  _agreement_id uuid,
  _signature text
) RETURNS public.legal_agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.legal_agreements;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _signature IS NULL OR length(btrim(_signature)) = 0 THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;

  SELECT * INTO row FROM public.legal_agreements WHERE id = _agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  IF row.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'Agreement is not pending signatures';
  END IF;

  IF uid = row.driver_id AND row.driver_signature IS NULL THEN
    UPDATE public.legal_agreements
       SET driver_signature = _signature,
           driver_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSIF uid = row.owner_id AND row.owner_signature IS NULL THEN
    UPDATE public.legal_agreements
       SET owner_signature = _signature,
           owner_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSE
    RAISE EXCEPTION 'Not permitted to sign this agreement' USING ERRCODE = '42501';
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_legal_agreement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_legal_agreement(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sign_rent_to_own_agreement(
  _agreement_id uuid,
  _signature text
) RETURNS public.rent_to_own_agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.rent_to_own_agreements;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _signature IS NULL OR length(btrim(_signature)) = 0 THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;

  SELECT * INTO row FROM public.rent_to_own_agreements WHERE id = _agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  IF row.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'Agreement is not pending signatures';
  END IF;

  IF uid = row.driver_id AND row.driver_signature IS NULL THEN
    UPDATE public.rent_to_own_agreements
       SET driver_signature = _signature,
           driver_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSIF uid = row.owner_id AND row.owner_signature IS NULL THEN
    UPDATE public.rent_to_own_agreements
       SET owner_signature = _signature,
           owner_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSE
    RAISE EXCEPTION 'Not permitted to sign this agreement' USING ERRCODE = '42501';
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) TO authenticated;
