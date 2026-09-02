ALTER TABLE public.telemetry_providers DROP CONSTRAINT IF EXISTS telemetry_providers_name_check;
ALTER TABLE public.telemetry_providers ADD CONSTRAINT telemetry_providers_name_check CHECK (name = ANY (ARRAY['emqx'::text,'traccar'::text,'sarekon'::text]));

INSERT INTO public.telemetry_providers (name, display_name, is_active, priority)
SELECT 'sarekon', 'Sarekon', false, 3
WHERE NOT EXISTS (SELECT 1 FROM public.telemetry_providers WHERE name = 'sarekon');

ALTER TABLE public.provider_credential_versions DROP CONSTRAINT IF EXISTS provider_credential_versions_provider_chk;
ALTER TABLE public.provider_credential_versions ADD CONSTRAINT provider_credential_versions_provider_chk CHECK (provider = ANY (ARRAY['hologram'::text,'traccar'::text,'meta'::text,'sarekon'::text]));

CREATE OR REPLACE FUNCTION public.provider_write_credentials(_provider text, _values jsonb, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF _provider NOT IN ('hologram','traccar','meta','sarekon') THEN
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
$function$;

INSERT INTO public.iot_sync_schedule (provider, interval_minutes, enabled)
SELECT 'sarekon', 60, true
WHERE NOT EXISTS (SELECT 1 FROM public.iot_sync_schedule WHERE provider = 'sarekon');
