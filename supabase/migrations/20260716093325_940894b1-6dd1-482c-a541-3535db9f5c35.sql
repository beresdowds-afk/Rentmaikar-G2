
-- =========================================================================
-- 1. Audit table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.agreement_signature_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('legal_agreement','rent_to_own_agreement')),
  agreement_id UUID NOT NULL,
  actor_id UUID,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('driver','owner','admin','system')),
  action TEXT NOT NULL,          -- e.g. 'driver_signed', 'owner_signed', 'admin_witnessed', 'status_changed'
  changed_columns TEXT[] NOT NULL DEFAULT '{}',
  old_status TEXT,
  new_status TEXT,
  signature_length INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agreement_signature_audit TO authenticated;
GRANT ALL ON public.agreement_signature_audit TO service_role;

ALTER TABLE public.agreement_signature_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all signature audit entries"
ON public.agreement_signature_audit
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Parties can view their own agreement audit entries"
ON public.agreement_signature_audit
FOR SELECT TO authenticated
USING (
  (agreement_type = 'legal_agreement' AND EXISTS (
    SELECT 1 FROM public.legal_agreements la
    WHERE la.id = agreement_signature_audit.agreement_id
      AND (la.driver_id = auth.uid() OR la.owner_id = auth.uid())
  ))
  OR
  (agreement_type = 'rent_to_own_agreement' AND EXISTS (
    SELECT 1 FROM public.rent_to_own_agreements rto
    WHERE rto.id = agreement_signature_audit.agreement_id
      AND (rto.driver_id = auth.uid() OR rto.owner_id = auth.uid())
  ))
);

CREATE INDEX IF NOT EXISTS idx_agreement_sig_audit_agreement
  ON public.agreement_signature_audit(agreement_type, agreement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agreement_sig_audit_actor
  ON public.agreement_signature_audit(actor_id, created_at DESC);

-- =========================================================================
-- 2. Shared limits
-- =========================================================================
-- Signature data URLs from the canvas are typically ~50KB. Cap at 200KB to
-- reject malformed payloads without breaking legitimate ones.
DO $$ BEGIN
  CREATE DOMAIN public.signature_payload AS TEXT
    CHECK (length(VALUE) BETWEEN 20 AND 200000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 3. Harden sign_legal_agreement + audit
-- =========================================================================
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
  old_status text;
  actor_role text;
  action text;
  changed text[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Server-side validation
  IF _signature IS NULL OR length(btrim(_signature)) = 0 THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;
  IF length(_signature) < 20 OR length(_signature) > 200000 THEN
    RAISE EXCEPTION 'Signature payload out of allowed size range';
  END IF;
  IF _signature !~ '^data:image/(png|jpeg|jpg|svg\+xml);base64,' THEN
    RAISE EXCEPTION 'Signature must be a base64 image data URL';
  END IF;

  SELECT * INTO row FROM public.legal_agreements WHERE id = _agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  old_status := row.status;
  IF row.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'Agreement is not pending signatures (status=%)', row.status;
  END IF;

  IF uid = row.driver_id AND row.driver_signature IS NULL THEN
    actor_role := 'driver';
    action := 'driver_signed';
    changed := ARRAY['driver_signature','driver_signed_at'];
    UPDATE public.legal_agreements
       SET driver_signature = _signature,
           driver_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSIF uid = row.owner_id AND row.owner_signature IS NULL THEN
    actor_role := 'owner';
    action := 'owner_signed';
    changed := ARRAY['owner_signature','owner_signed_at'];
    UPDATE public.legal_agreements
       SET owner_signature = _signature,
           owner_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSE
    RAISE EXCEPTION 'Not permitted to sign this agreement' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.agreement_signature_audit
    (agreement_type, agreement_id, actor_id, actor_role, action,
     changed_columns, old_status, new_status, signature_length)
  VALUES
    ('legal_agreement', _agreement_id, uid, actor_role, action,
     changed, old_status, row.status, length(_signature));

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_legal_agreement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_legal_agreement(uuid, text) TO authenticated;

-- =========================================================================
-- 4. Harden sign_rent_to_own_agreement + audit
-- =========================================================================
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
  old_status text;
  actor_role text;
  action text;
  changed text[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _signature IS NULL OR length(btrim(_signature)) = 0 THEN
    RAISE EXCEPTION 'Signature is required';
  END IF;
  IF length(_signature) < 20 OR length(_signature) > 200000 THEN
    RAISE EXCEPTION 'Signature payload out of allowed size range';
  END IF;
  IF _signature !~ '^data:image/(png|jpeg|jpg|svg\+xml);base64,' THEN
    RAISE EXCEPTION 'Signature must be a base64 image data URL';
  END IF;

  SELECT * INTO row FROM public.rent_to_own_agreements WHERE id = _agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING ERRCODE = 'P0002';
  END IF;
  old_status := row.status;
  IF row.status <> 'pending_signatures' THEN
    RAISE EXCEPTION 'Agreement is not pending signatures (status=%)', row.status;
  END IF;

  IF uid = row.driver_id AND row.driver_signature IS NULL THEN
    actor_role := 'driver';
    action := 'driver_signed';
    changed := ARRAY['driver_signature','driver_signed_at'];
    UPDATE public.rent_to_own_agreements
       SET driver_signature = _signature,
           driver_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSIF uid = row.owner_id AND row.owner_signature IS NULL THEN
    actor_role := 'owner';
    action := 'owner_signed';
    changed := ARRAY['owner_signature','owner_signed_at'];
    UPDATE public.rent_to_own_agreements
       SET owner_signature = _signature,
           owner_signed_at = now()
     WHERE id = _agreement_id
     RETURNING * INTO row;
  ELSE
    RAISE EXCEPTION 'Not permitted to sign this agreement' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.agreement_signature_audit
    (agreement_type, agreement_id, actor_id, actor_role, action,
     changed_columns, old_status, new_status, signature_length)
  VALUES
    ('rent_to_own_agreement', _agreement_id, uid, actor_role, action,
     changed, old_status, row.status, length(_signature));

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_rent_to_own_agreement(uuid, text) TO authenticated;

-- =========================================================================
-- 5. Status/witness auditing via trigger (covers admin + edge-function paths)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.audit_legal_agreement_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text[] := '{}';
  actor_role text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changed := changed || 'status';
  END IF;
  IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN
    changed := changed || ARRAY['admin_witness_signature','admin_witnessed_at','admin_witness_id'];
  END IF;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    actor_role := 'system';
  ELSIF public.is_admin() THEN
    actor_role := 'admin';
  ELSIF auth.uid() = NEW.driver_id THEN
    actor_role := 'driver';
  ELSIF auth.uid() = NEW.owner_id THEN
    actor_role := 'owner';
  ELSE
    actor_role := 'system';
  END IF;

  INSERT INTO public.agreement_signature_audit
    (agreement_type, agreement_id, actor_id, actor_role, action,
     changed_columns, old_status, new_status)
  VALUES
    ('legal_agreement', NEW.id, auth.uid(), actor_role,
     CASE
       WHEN 'admin_witness_signature' = ANY(changed) THEN 'admin_witnessed'
       WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
       ELSE 'updated'
     END,
     changed, OLD.status, NEW.status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_legal_agreement_changes ON public.legal_agreements;
CREATE TRIGGER audit_legal_agreement_changes
AFTER UPDATE ON public.legal_agreements
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.admin_witness_signature IS DISTINCT FROM NEW.admin_witness_signature
)
EXECUTE FUNCTION public.audit_legal_agreement_changes();

CREATE OR REPLACE FUNCTION public.audit_rto_agreement_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text[] := '{}';
  actor_role text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changed := changed || 'status';
  END IF;
  IF NEW.admin_witness_signature IS DISTINCT FROM OLD.admin_witness_signature THEN
    changed := changed || ARRAY['admin_witness_signature','admin_witnessed_at','admin_witness_id'];
  END IF;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    actor_role := 'system';
  ELSIF public.is_admin() THEN
    actor_role := 'admin';
  ELSIF auth.uid() = NEW.driver_id THEN
    actor_role := 'driver';
  ELSIF auth.uid() = NEW.owner_id THEN
    actor_role := 'owner';
  ELSE
    actor_role := 'system';
  END IF;

  INSERT INTO public.agreement_signature_audit
    (agreement_type, agreement_id, actor_id, actor_role, action,
     changed_columns, old_status, new_status)
  VALUES
    ('rent_to_own_agreement', NEW.id, auth.uid(), actor_role,
     CASE
       WHEN 'admin_witness_signature' = ANY(changed) THEN 'admin_witnessed'
       WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
       ELSE 'updated'
     END,
     changed, OLD.status, NEW.status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_rto_agreement_changes ON public.rent_to_own_agreements;
CREATE TRIGGER audit_rto_agreement_changes
AFTER UPDATE ON public.rent_to_own_agreements
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.admin_witness_signature IS DISTINCT FROM NEW.admin_witness_signature
)
EXECUTE FUNCTION public.audit_rto_agreement_changes();

-- =========================================================================
-- 6. Driver-scoped rental update RPC (whitelisted fields only)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.driver_request_rental_extension(
  _rental_id uuid
) RETURNS public.rentals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row public.rentals;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO row FROM public.rentals WHERE id = _rental_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental not found' USING ERRCODE = 'P0002';
  END IF;
  IF row.driver_id <> uid THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF row.status <> 'active' THEN
    RAISE EXCEPTION 'Rental is not active';
  END IF;

  UPDATE public.rentals
     SET extension_requested = true
   WHERE id = _rental_id
   RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_request_rental_extension(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_request_rental_extension(uuid) TO authenticated;
