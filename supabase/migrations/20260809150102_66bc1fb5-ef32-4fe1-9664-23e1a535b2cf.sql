
CREATE TABLE IF NOT EXISTS public.provider_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  masked jsonb NOT NULL DEFAULT '{}'::jsonb,
  vault_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_credential_versions_provider_chk CHECK (provider IN ('hologram','traccar')),
  CONSTRAINT provider_credential_versions_status_chk CHECK (status IN ('active','retired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_credential_versions_active_uidx
  ON public.provider_credential_versions (provider) WHERE status = 'active';

GRANT SELECT ON public.provider_credential_versions TO authenticated;
GRANT ALL ON public.provider_credential_versions TO service_role;

ALTER TABLE public.provider_credential_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read provider credential versions"
ON public.provider_credential_versions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_provider_credential_versions_updated_at
BEFORE UPDATE ON public.provider_credential_versions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.provider_write_credentials(
  _provider text,
  _values jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_vault jsonb := '{}'::jsonb;
  v_masked jsonb := '{}'::jsonb;
  k text;
  val text;
  sid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins may rotate provider credentials';
  END IF;
  IF _provider NOT IN ('hologram','traccar') THEN
    RAISE EXCEPTION 'Unsupported provider';
  END IF;
  IF _values IS NULL OR jsonb_typeof(_values) <> 'object' THEN
    RAISE EXCEPTION 'Credential values required';
  END IF;

  FOR k, val IN SELECT key, value FROM jsonb_each_text(_values) LOOP
    IF val IS NULL OR length(trim(val)) = 0 THEN CONTINUE; END IF;
    sid := vault.create_secret(trim(val), _provider || '_' || k || '_' || v_id::text, 'Provider credential (admin rotation)');
    v_vault := v_vault || jsonb_build_object(k, sid);
    v_masked := v_masked || jsonb_build_object(k, public.mask_secret_value(trim(val)));
  END LOOP;

  IF v_vault = '{}'::jsonb THEN
    RAISE EXCEPTION 'No credential values supplied';
  END IF;

  UPDATE public.provider_credential_versions
     SET status = 'retired'
   WHERE provider = _provider AND status = 'active';

  INSERT INTO public.provider_credential_versions (id, provider, masked, vault_ids, status, notes, created_by)
  VALUES (v_id, _provider, v_masked, v_vault, 'active', _notes, auth.uid());

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'provider_credentials_rotated', 'provider_credential_version', v_id::text,
          jsonb_build_object('provider', _provider, 'masked', v_masked));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_read_credentials(_provider text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  out jsonb := '{}'::jsonb;
  k text;
  v text;
BEGIN
  SELECT * INTO r FROM public.provider_credential_versions
   WHERE provider = _provider AND status = 'active' LIMIT 1;
  IF r.id IS NULL THEN RETURN NULL; END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each_text(r.vault_ids) LOOP
    out := out || jsonb_build_object(
      k, (SELECT decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = v::uuid)
    );
  END LOOP;
  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_write_credentials(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_read_credentials(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_write_credentials(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_read_credentials(text) TO service_role;
