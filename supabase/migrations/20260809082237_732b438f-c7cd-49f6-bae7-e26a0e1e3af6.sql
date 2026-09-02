
-- 1. Scheduling key stored in the vault so pg_cron can authenticate to edge functions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'CRON_SECRET');
  END IF;
END$$;

-- 2. Helper used by edge functions (service role only) to validate the cron secret
CREATE OR REPLACE FUNCTION public.verify_cron_secret(_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
      AND decrypted_secret = _secret
  );
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- 3. Replace duplicate / unauthenticated daily task schedules with one working job
DO $$
BEGIN
  PERFORM cron.unschedule('generate-daily-admin-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM cron.unschedule('generate-daily-tasks');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'generate-daily-tasks',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bwvocmhcledbwqlpcswp.supabase.co/functions/v1/generate-daily-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $cron$
);

-- 4a. Security: two_factor_settings — users must not disable mandatory 2FA
CREATE OR REPLACE FUNCTION public.enforce_two_factor_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.is_mandatory IS DISTINCT FROM OLD.is_mandatory
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'The two-factor requirement is administered by Rentmaikar and cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.is_mandatory AND NEW.is_enabled = false THEN
    RAISE EXCEPTION 'Two-factor authentication is mandatory for your account and cannot be switched off'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_two_factor_column_scope_trg ON public.two_factor_settings;
CREATE TRIGGER enforce_two_factor_column_scope_trg
  BEFORE UPDATE ON public.two_factor_settings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_two_factor_column_scope();

DROP POLICY IF EXISTS "Users can update their own 2FA settings" ON public.two_factor_settings;
CREATE POLICY "Users can update their own 2FA settings"
  ON public.two_factor_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Column-level privileges: users may only touch their own non-administrative fields
REVOKE UPDATE ON public.two_factor_settings FROM authenticated;
GRANT UPDATE (is_enabled, phone_number, preferred_channel, enabled_at, updated_at)
  ON public.two_factor_settings TO authenticated;
GRANT ALL ON public.two_factor_settings TO service_role;

-- 4b. Security: user_subscriptions — only auto_renew is user-editable
DROP TRIGGER IF EXISTS enforce_user_subscription_column_scope_trg ON public.user_subscriptions;
CREATE TRIGGER enforce_user_subscription_column_scope_trg
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_subscription_column_scope();

DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can update their own subscriptions"
  ON public.user_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.user_subscriptions FROM authenticated;
GRANT UPDATE (auto_renew, updated_at) ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
