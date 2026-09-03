CREATE TABLE IF NOT EXISTS public.vehicle_rental_authorizations (
  id TEXT PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  vehicle_make TEXT NOT NULL DEFAULT '',
  vehicle_model TEXT NOT NULL DEFAULT '',
  vehicle_year INTEGER,
  license_plate TEXT,
  vin TEXT,
  color TEXT,
  pickup_city TEXT,
  pickup_location TEXT,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  owner_id UUID NOT NULL,
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED','PENDING')),
  matching_status TEXT NOT NULL DEFAULT 'matching_pool_active',
  matched_driver_id UUID,
  matched_driver_name TEXT,
  authorization_text TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL DEFAULT 'v2026.1',
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  cancellation_token TEXT NOT NULL UNIQUE,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_rental_authorizations_vehicle_key
  ON public.vehicle_rental_authorizations (vehicle_id);

GRANT SELECT, INSERT, UPDATE ON public.vehicle_rental_authorizations TO authenticated;
GRANT ALL ON public.vehicle_rental_authorizations TO service_role;

ALTER TABLE public.vehicle_rental_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vra_owner_select" ON public.vehicle_rental_authorizations
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_any_support_staff(auth.uid())
  );

CREATE POLICY "vra_owner_insert" ON public.vehicle_rental_authorizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "vra_owner_update" ON public.vehicle_rental_authorizations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_authorization_by_token(p_token TEXT)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(t) - 'ip_address' - 'user_agent' - 'owner_phone'
  FROM public.vehicle_rental_authorizations t
  WHERE t.cancellation_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cancel_authorization_by_token(
  p_token TEXT,
  p_reason TEXT DEFAULT NULL,
  p_by_name TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.vehicle_rental_authorizations%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Published by mistake / Owner requested cancellation');
BEGIN
  SELECT * INTO rec FROM public.vehicle_rental_authorizations
  WHERE cancellation_token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Vehicle rental authorization record not found.');
  END IF;

  UPDATE public.vehicle_rental_authorizations SET
    status = 'CANCELLED',
    matching_status = 'unlisted_cancelled',
    cancelled_at = now(),
    cancelled_by = COALESCE(auth.uid()::text, 'cancellation-link'),
    cancellation_reason = v_reason,
    updated_at = now(),
    audit_trail = audit_trail || jsonb_build_array(jsonb_build_object(
      'id', 'AUD-CANC-' || extract(epoch from now())::bigint::text,
      'action', 'AUTHORIZATION_CANCELLED',
      'performed_by', COALESCE(auth.uid()::text, 'cancellation-link'),
      'performed_by_name', COALESCE(NULLIF(trim(p_by_name), ''), 'Cancellation link holder'),
      'performed_by_role', 'owner',
      'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'notes', 'Vehicle authorization revoked and listing unpublished from Catalogue. Reason: ' || v_reason
    ))
  WHERE id = rec.id
  RETURNING * INTO rec;

  UPDATE public.vehicles
    SET is_public = false, status = 'pending', updated_at = now()
    WHERE id = rec.vehicle_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Vehicle rental authorization has been successfully cancelled and removed from the active catalogue.',
    'authorization', to_jsonb(rec) - 'ip_address' - 'user_agent' - 'owner_phone'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_authorization_by_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_authorization_by_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_authorization_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_authorization_by_token(TEXT, TEXT, TEXT) TO anon, authenticated;