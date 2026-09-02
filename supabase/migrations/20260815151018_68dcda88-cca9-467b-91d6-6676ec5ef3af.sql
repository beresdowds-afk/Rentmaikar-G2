CREATE OR REPLACE FUNCTION public.provider_revoke_credentials(_provider text, _notes text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  k text;
  v text;
  n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins may reset provider credentials';
  END IF;
  IF _provider NOT IN ('hologram','traccar','meta','sarekon') THEN
    RAISE EXCEPTION 'Unsupported provider';
  END IF;

  FOR r IN SELECT * FROM public.provider_credential_versions WHERE provider = _provider AND status <> 'revoked' LOOP
    FOR k, v IN SELECT key, value FROM jsonb_each_text(r.vault_ids) LOOP
      BEGIN
        DELETE FROM vault.secrets WHERE id = v::uuid;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
    UPDATE public.provider_credential_versions
       SET status = 'revoked', vault_ids = '{}'::jsonb
     WHERE id = r.id;
    n := n + 1;
  END LOOP;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'provider_credentials_reset', 'provider_credential_versions', _provider,
          jsonb_build_object('provider', _provider, 'versions_revoked', n, 'notes', _notes));

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.provider_revoke_credentials(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_revoke_credentials(text, text) TO authenticated;