
-- Proxy billing accounts: drivers submit another individual whose card they want to use.
-- Person is verified via Persona and must sign a consent form.
CREATE TABLE public.driver_proxy_billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proxy_full_name TEXT NOT NULL,
  proxy_email TEXT NOT NULL,
  proxy_phone TEXT,
  proxy_relationship TEXT,
  region TEXT NOT NULL DEFAULT 'US',

  -- Consent link
  consent_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  consent_token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  consent_sent_at TIMESTAMPTZ,
  consent_channels TEXT[] DEFAULT '{}',

  -- Persona identity verification
  persona_inquiry_id TEXT,
  identity_status TEXT NOT NULL DEFAULT 'pending' CHECK (identity_status IN ('pending','submitted','verified','failed')),
  identity_verified_at TIMESTAMPTZ,

  -- Consent signature
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','sent','signed','rejected','expired','revoked')),
  consent_signed_at TIMESTAMPTZ,
  consent_signature TEXT,
  consent_ip TEXT,
  consent_user_agent TEXT,
  consent_pdf_url TEXT,

  -- Card tokenization (never store PAN)
  card_provider TEXT CHECK (card_provider IN ('paystack','paypal','opay')),
  card_token TEXT,
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_brand TEXT,
  card_exp_month INT CHECK (card_exp_month IS NULL OR (card_exp_month BETWEEN 1 AND 12)),
  card_exp_year INT CHECK (card_exp_year IS NULL OR card_exp_year BETWEEN 2024 AND 2100),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','awaiting_consent','awaiting_card','active','revoked','disabled')),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  revoke_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active proxy per driver, and any given person can back only one driver at a time.
CREATE UNIQUE INDEX driver_proxy_one_active_per_driver
  ON public.driver_proxy_billing_accounts (driver_id)
  WHERE status IN ('pending','awaiting_consent','awaiting_card','active');
CREATE UNIQUE INDEX driver_proxy_one_active_per_email
  ON public.driver_proxy_billing_accounts (lower(proxy_email))
  WHERE status IN ('awaiting_consent','awaiting_card','active');
CREATE INDEX driver_proxy_by_driver ON public.driver_proxy_billing_accounts(driver_id);
CREATE INDEX driver_proxy_by_status ON public.driver_proxy_billing_accounts(status);

GRANT SELECT, INSERT, UPDATE ON public.driver_proxy_billing_accounts TO authenticated;
GRANT ALL ON public.driver_proxy_billing_accounts TO service_role;

ALTER TABLE public.driver_proxy_billing_accounts ENABLE ROW LEVEL SECURITY;

-- Drivers see their own proxy record
CREATE POLICY "Driver views own proxy"
  ON public.driver_proxy_billing_accounts FOR SELECT TO authenticated
  USING (auth.uid() = driver_id OR public.is_admin());

-- Drivers create their own proxy request
CREATE POLICY "Driver creates own proxy"
  ON public.driver_proxy_billing_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id AND status = 'pending');

-- Drivers may only update proxy contact fields while still pending; sensitive fields
-- (identity_status, consent_*, card_*, status, revoked_*) are enforced by a trigger.
CREATE POLICY "Driver updates own pending proxy"
  ON public.driver_proxy_billing_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = driver_id AND status = 'pending')
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Admins manage proxies"
  ON public.driver_proxy_billing_accounts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Field-scope enforcement for drivers.
CREATE OR REPLACE FUNCTION public.enforce_proxy_billing_column_scope()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE denied text[] := '{}';
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() = OLD.driver_id THEN
    IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN denied := denied || 'identity_status'; NEW.identity_status := OLD.identity_status; END IF;
    IF NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at THEN denied := denied || 'identity_verified_at'; NEW.identity_verified_at := OLD.identity_verified_at; END IF;
    IF NEW.consent_status IS DISTINCT FROM OLD.consent_status THEN denied := denied || 'consent_status'; NEW.consent_status := OLD.consent_status; END IF;
    IF NEW.consent_signed_at IS DISTINCT FROM OLD.consent_signed_at THEN denied := denied || 'consent_signed_at'; NEW.consent_signed_at := OLD.consent_signed_at; END IF;
    IF NEW.consent_signature IS DISTINCT FROM OLD.consent_signature THEN denied := denied || 'consent_signature'; NEW.consent_signature := OLD.consent_signature; END IF;
    IF NEW.consent_pdf_url IS DISTINCT FROM OLD.consent_pdf_url THEN denied := denied || 'consent_pdf_url'; NEW.consent_pdf_url := OLD.consent_pdf_url; END IF;
    IF NEW.consent_token IS DISTINCT FROM OLD.consent_token THEN denied := denied || 'consent_token'; NEW.consent_token := OLD.consent_token; END IF;
    IF NEW.card_token IS DISTINCT FROM OLD.card_token THEN denied := denied || 'card_token'; NEW.card_token := OLD.card_token; END IF;
    IF NEW.card_last4 IS DISTINCT FROM OLD.card_last4 THEN denied := denied || 'card_last4'; NEW.card_last4 := OLD.card_last4; END IF;
    IF NEW.card_brand IS DISTINCT FROM OLD.card_brand THEN denied := denied || 'card_brand'; NEW.card_brand := OLD.card_brand; END IF;
    IF NEW.card_provider IS DISTINCT FROM OLD.card_provider THEN denied := denied || 'card_provider'; NEW.card_provider := OLD.card_provider; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; NEW.status := OLD.status; END IF;
    IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN denied := denied || 'revoked_at'; NEW.revoked_at := OLD.revoked_at; END IF;
    IF NEW.revoked_by IS DISTINCT FROM OLD.revoked_by THEN denied := denied || 'revoked_by'; NEW.revoked_by := OLD.revoked_by; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
  END IF;
  IF array_length(denied,1) > 0 THEN
    PERFORM public.log_permission_denied('driver_proxy_billing_accounts', OLD.id::text,
      'Driver attempted to modify protected proxy billing fields', denied, '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_proxy_billing_scope
BEFORE UPDATE ON public.driver_proxy_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.enforce_proxy_billing_column_scope();

CREATE TRIGGER trg_update_proxy_billing_updated_at
BEFORE UPDATE ON public.driver_proxy_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log for every proxy billing action
CREATE TABLE public.proxy_billing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_account_id UUID REFERENCES public.driver_proxy_billing_accounts(id) ON DELETE CASCADE,
  driver_id UUID,
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX proxy_billing_audit_by_account ON public.proxy_billing_audit_log(proxy_account_id);
CREATE INDEX proxy_billing_audit_by_driver ON public.proxy_billing_audit_log(driver_id);
CREATE INDEX proxy_billing_audit_by_created ON public.proxy_billing_audit_log(created_at DESC);

GRANT SELECT ON public.proxy_billing_audit_log TO authenticated;
GRANT ALL ON public.proxy_billing_audit_log TO service_role;

ALTER TABLE public.proxy_billing_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver sees own proxy audit"
  ON public.proxy_billing_audit_log FOR SELECT TO authenticated
  USING (auth.uid() = driver_id OR public.is_admin());

-- Public consent lookup: returns minimal, non-sensitive context for a token.
CREATE OR REPLACE FUNCTION public.get_proxy_consent_context(_token TEXT)
RETURNS TABLE(
  proxy_account_id UUID,
  proxy_full_name TEXT,
  driver_name TEXT,
  region TEXT,
  identity_status TEXT,
  consent_status TEXT,
  token_expires_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN RAISE EXCEPTION 'invalid token'; END IF;
  SELECT * INTO r FROM public.driver_proxy_billing_accounts WHERE consent_token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid or expired link' USING ERRCODE='P0002'; END IF;
  IF r.consent_token_expires_at < now() THEN RAISE EXCEPTION 'link expired'; END IF;
  RETURN QUERY
    SELECT r.id, r.proxy_full_name,
      COALESCE(p.full_name, p.email, 'the driver')::text,
      r.region, r.identity_status, r.consent_status, r.consent_token_expires_at
    FROM public.profiles p WHERE p.user_id = r.driver_id
    UNION ALL
    SELECT r.id, r.proxy_full_name, 'the driver', r.region, r.identity_status, r.consent_status, r.consent_token_expires_at
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = r.driver_id)
    LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.get_proxy_consent_context(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proxy_consent_context(TEXT) TO anon, authenticated;

-- Proxy submits consent by token.
CREATE OR REPLACE FUNCTION public.submit_proxy_consent(
  _token TEXT, _signature TEXT, _ip TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL
) RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF _signature IS NULL OR length(btrim(_signature)) < 20 OR length(_signature) > 200000 THEN
    RAISE EXCEPTION 'invalid signature payload';
  END IF;
  IF _signature !~ '^data:image/(png|jpeg|jpg|svg\+xml);base64,' THEN
    RAISE EXCEPTION 'signature must be a base64 image data URL';
  END IF;

  SELECT * INTO r FROM public.driver_proxy_billing_accounts
    WHERE consent_token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid link' USING ERRCODE='P0002'; END IF;
  IF r.consent_token_expires_at < now() THEN RAISE EXCEPTION 'link expired'; END IF;
  IF r.identity_status <> 'verified' THEN
    RAISE EXCEPTION 'identity must be verified before signing';
  END IF;
  IF r.consent_status = 'signed' THEN RAISE EXCEPTION 'consent already signed'; END IF;
  IF r.status = 'revoked' OR r.status = 'disabled' THEN RAISE EXCEPTION 'proxy account is not active'; END IF;

  UPDATE public.driver_proxy_billing_accounts
    SET consent_status='signed', consent_signed_at=now(),
        consent_signature=_signature, consent_ip=_ip, consent_user_agent=_user_agent,
        status='awaiting_card'
    WHERE id = r.id RETURNING * INTO r;

  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details, ip_address, user_agent)
  VALUES (r.id, r.driver_id, NULL, 'proxy', 'consent_signed',
          jsonb_build_object('signature_length', length(_signature)), _ip, _user_agent);

  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.submit_proxy_consent(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proxy_consent(TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- Admin revoke (admin-mediator policy).
CREATE OR REPLACE FUNCTION public.admin_revoke_proxy_billing(_proxy_id UUID, _reason TEXT)
RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE='42501'; END IF;
  UPDATE public.driver_proxy_billing_accounts
    SET status='revoked', revoked_at=now(), revoked_by=auth.uid(),
        revoke_reason=COALESCE(_reason,'admin revoked'), consent_status='revoked'
    WHERE id=_proxy_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details)
  VALUES (r.id, r.driver_id, auth.uid(), 'admin', 'admin_revoked', jsonb_build_object('reason', _reason));
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.admin_revoke_proxy_billing(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_proxy_billing(UUID,TEXT) TO authenticated;

-- Audit trigger for status/identity/consent transitions
CREATE OR REPLACE FUNCTION public.audit_proxy_billing_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details)
    VALUES (NEW.id, NEW.driver_id, auth.uid(),
            CASE WHEN public.is_admin() THEN 'admin' ELSE 'driver' END,
            'proxy_created',
            jsonb_build_object('proxy_email', NEW.proxy_email, 'region', NEW.region));
    RETURN NEW;
  END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    changed := changed || jsonb_build_object('identity_status', jsonb_build_object('from', OLD.identity_status, 'to', NEW.identity_status));
  END IF;
  IF NEW.consent_status IS DISTINCT FROM OLD.consent_status THEN
    changed := changed || jsonb_build_object('consent_status', jsonb_build_object('from', OLD.consent_status, 'to', NEW.consent_status));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changed := changed || jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.card_token IS DISTINCT FROM OLD.card_token THEN
    changed := changed || jsonb_build_object('card_added', jsonb_build_object('last4', NEW.card_last4, 'brand', NEW.card_brand, 'provider', NEW.card_provider));
  END IF;
  IF changed <> '{}'::jsonb THEN
    INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details)
    VALUES (NEW.id, NEW.driver_id, auth.uid(),
            CASE WHEN public.is_admin() THEN 'admin'
                 WHEN auth.uid() = NEW.driver_id THEN 'driver'
                 ELSE 'system' END,
            'proxy_updated', changed);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_proxy_billing_insert
AFTER INSERT ON public.driver_proxy_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_proxy_billing_changes();

CREATE TRIGGER trg_audit_proxy_billing_update
AFTER UPDATE ON public.driver_proxy_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_proxy_billing_changes();
