-- Verify a scheduler token against the value stored in the vault.
-- Lets scheduled jobs authenticate without depending on a separate copy of
-- the token in the edge-function environment (which can drift out of sync).
CREATE OR REPLACE FUNCTION public.verify_cron_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  stored text;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO stored
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;
  IF stored IS NULL THEN
    RETURN false;
  END IF;
  RETURN stored = _token;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text) TO service_role;