ALTER TABLE public.provider_credential_versions
  DROP CONSTRAINT IF EXISTS provider_credential_versions_provider_chk;
ALTER TABLE public.provider_credential_versions
  ADD CONSTRAINT provider_credential_versions_provider_chk
  CHECK (provider IN ('hologram','traccar','meta'));

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
  IF _provider NOT IN ('hologram','traccar','meta') THEN
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

REVOKE ALL ON FUNCTION public.provider_write_credentials(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_write_credentials(text, jsonb, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.meta_ads_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  ad_account_id text,
  campaign_id text NOT NULL,
  campaign_name text,
  action text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ads_action_log_action_chk CHECK (action IN ('pause','resume'))
);

GRANT SELECT ON public.meta_ads_action_log TO authenticated;
GRANT ALL ON public.meta_ads_action_log TO service_role;

ALTER TABLE public.meta_ads_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read meta ads action log" ON public.meta_ads_action_log;
CREATE POLICY "Admins can read meta ads action log"
ON public.meta_ads_action_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS meta_ads_action_log_created_idx
  ON public.meta_ads_action_log (created_at DESC);