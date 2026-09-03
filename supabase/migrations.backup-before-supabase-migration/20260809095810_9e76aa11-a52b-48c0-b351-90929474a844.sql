
CREATE TABLE IF NOT EXISTS public.emqx_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_masked text NOT NULL,
  api_secret_masked text NOT NULL,
  vault_key_id uuid NOT NULL,
  vault_secret_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'staged',
  verified_at timestamptz,
  verification_result jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emqx_credential_versions_status_chk
    CHECK (status IN ('staged','verified','active','previous','rolled_back','failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS emqx_credential_versions_one_active
  ON public.emqx_credential_versions ((status)) WHERE status = 'active';

GRANT SELECT ON public.emqx_credential_versions TO authenticated;
GRANT ALL ON public.emqx_credential_versions TO service_role;

ALTER TABLE public.emqx_credential_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read emqx credential versions" ON public.emqx_credential_versions;
CREATE POLICY "Admins read emqx credential versions"
  ON public.emqx_credential_versions FOR SELECT TO authenticated
  USING (public.is_admin());

-- mask helper
CREATE OR REPLACE FUNCTION public.mask_secret_value(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _v IS NULL OR length(_v) = 0 THEN ''
    WHEN length(_v) <= 8 THEN repeat('•', length(_v))
    ELSE left(_v, 4) || repeat('•', 6) || right(_v, 4)
  END
$$;
REVOKE ALL ON FUNCTION public.mask_secret_value(text) FROM PUBLIC, anon;

-- Stage a new credential pair (admin only). Values go straight into the vault.
CREATE OR REPLACE FUNCTION public.emqx_stage_credentials(_api_key text, _api_secret text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_key_id uuid;
  v_secret_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may rotate EMQX credentials';
  END IF;
  IF coalesce(length(trim(_api_key)),0) < 6 OR coalesce(length(trim(_api_secret)),0) < 6 THEN
    RAISE EXCEPTION 'API key and secret are required';
  END IF;

  v_key_id := vault.create_secret(trim(_api_key), 'EMQX_API_KEY_' || v_id::text, 'EMQX API key (staged rotation)');
  v_secret_id := vault.create_secret(trim(_api_secret), 'EMQX_API_SECRET_' || v_id::text, 'EMQX API secret (staged rotation)');

  INSERT INTO public.emqx_credential_versions
    (id, api_key_masked, api_secret_masked, vault_key_id, vault_secret_id, status, notes, created_by)
  VALUES
    (v_id, public.mask_secret_value(trim(_api_key)), public.mask_secret_value(trim(_api_secret)),
     v_key_id, v_secret_id, 'staged', _notes, auth.uid());

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'emqx_credentials_staged', 'emqx_credential_version', v_id::text,
          jsonb_build_object('api_key_masked', public.mask_secret_value(trim(_api_key))));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.emqx_stage_credentials(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emqx_stage_credentials(text,text,text) TO authenticated, service_role;

-- Backend-only: read decrypted staged/active credentials.
CREATE OR REPLACE FUNCTION public.emqx_read_credentials(_version_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, api_key text, api_secret text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF _version_id IS NULL THEN
    SELECT * INTO r FROM public.emqx_credential_versions WHERE status = 'active' LIMIT 1;
  ELSE
    SELECT * INTO r FROM public.emqx_credential_versions WHERE emqx_credential_versions.id = _version_id;
  END IF;
  IF r.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.id,
    (SELECT decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = r.vault_key_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets ds WHERE ds.id = r.vault_secret_id),
    r.status;
END;
$$;
REVOKE ALL ON FUNCTION public.emqx_read_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emqx_read_credentials(uuid) TO service_role;

-- Record verification outcome (backend after live EMQX probe).
CREATE OR REPLACE FUNCTION public.emqx_record_verification(_version_id uuid, _ok boolean, _result jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.emqx_credential_versions
     SET status = CASE WHEN _ok THEN 'verified' ELSE 'failed' END,
         verified_at = now(),
         verification_result = _result
   WHERE id = _version_id AND status IN ('staged','verified','failed');
END;
$$;
REVOKE ALL ON FUNCTION public.emqx_record_verification(uuid,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emqx_record_verification(uuid,boolean,jsonb) TO service_role;

-- Activate a verified version; previous active becomes rollback target.
CREATE OR REPLACE FUNCTION public.emqx_activate_credentials(_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid; v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may activate EMQX credentials';
  END IF;
  SELECT status INTO v_status FROM public.emqx_credential_versions WHERE id = _version_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Unknown credential version'; END IF;
  IF v_status <> 'verified' THEN
    RAISE EXCEPTION 'Credentials must pass a live EMQX check before activation';
  END IF;

  SELECT id INTO v_prev FROM public.emqx_credential_versions WHERE status = 'active' LIMIT 1;
  IF v_prev IS NOT NULL THEN
    UPDATE public.emqx_credential_versions SET status = 'previous', retired_at = now() WHERE id = v_prev;
  END IF;

  UPDATE public.emqx_credential_versions
     SET status = 'active', activated_at = now(), activated_by = auth.uid(), retired_at = NULL
   WHERE id = _version_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'emqx_credentials_activated', 'emqx_credential_version', _version_id::text,
          jsonb_build_object('previous_version', v_prev));

  RETURN jsonb_build_object('activated', _version_id, 'previous', v_prev);
END;
$$;
REVOKE ALL ON FUNCTION public.emqx_activate_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emqx_activate_credentials(uuid) TO authenticated, service_role;

-- Roll back to the most recently retired version.
CREATE OR REPLACE FUNCTION public.emqx_rollback_credentials()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev uuid; v_current uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may roll back EMQX credentials';
  END IF;
  SELECT id INTO v_current FROM public.emqx_credential_versions WHERE status = 'active' LIMIT 1;
  SELECT id INTO v_prev FROM public.emqx_credential_versions
   WHERE status = 'previous' ORDER BY retired_at DESC NULLS LAST LIMIT 1;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'No previous credential version available to roll back to'; END IF;

  IF v_current IS NOT NULL THEN
    UPDATE public.emqx_credential_versions SET status = 'rolled_back', retired_at = now() WHERE id = v_current;
  END IF;
  UPDATE public.emqx_credential_versions
     SET status = 'active', activated_at = now(), activated_by = auth.uid(), retired_at = NULL
   WHERE id = v_prev;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'emqx_credentials_rolled_back', 'emqx_credential_version', v_prev::text,
          jsonb_build_object('rolled_back_from', v_current));

  RETURN jsonb_build_object('restored', v_prev, 'rolled_back_from', v_current);
END;
$$;
REVOKE ALL ON FUNCTION public.emqx_rollback_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emqx_rollback_credentials() TO authenticated, service_role;
