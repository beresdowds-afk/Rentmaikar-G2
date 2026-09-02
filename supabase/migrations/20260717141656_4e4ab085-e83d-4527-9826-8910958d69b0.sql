
-- 1) New columns on the proxy account
ALTER TABLE public.driver_proxy_billing_accounts
  ADD COLUMN IF NOT EXISTS use_type TEXT NOT NULL DEFAULT 'recurring'
    CHECK (use_type IN ('one_time','recurring')),
  ADD COLUMN IF NOT EXISTS validity_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validity_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_uses INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (admin_review_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS admin_reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS card_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Expand allowed status values (superset of existing)
ALTER TABLE public.driver_proxy_billing_accounts DROP CONSTRAINT IF EXISTS driver_proxy_billing_accounts_status_check;
ALTER TABLE public.driver_proxy_billing_accounts
  ADD CONSTRAINT driver_proxy_billing_accounts_status_check
  CHECK (status IN ('pending','awaiting_consent','awaiting_review','awaiting_card','active','revoked','disabled','expired','used'));

-- Column-scope trigger: block drivers from changing new admin/validity/usage fields
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
    IF NEW.card_fingerprint IS DISTINCT FROM OLD.card_fingerprint THEN denied := denied || 'card_fingerprint'; NEW.card_fingerprint := OLD.card_fingerprint; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN denied := denied || 'status'; NEW.status := OLD.status; END IF;
    IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN denied := denied || 'revoked_at'; NEW.revoked_at := OLD.revoked_at; END IF;
    IF NEW.revoked_by IS DISTINCT FROM OLD.revoked_by THEN denied := denied || 'revoked_by'; NEW.revoked_by := OLD.revoked_by; END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN denied := denied || 'driver_id'; NEW.driver_id := OLD.driver_id; END IF;
    IF NEW.admin_review_status IS DISTINCT FROM OLD.admin_review_status THEN denied := denied || 'admin_review_status'; NEW.admin_review_status := OLD.admin_review_status; END IF;
    IF NEW.admin_reviewed_by IS DISTINCT FROM OLD.admin_reviewed_by THEN denied := denied || 'admin_reviewed_by'; NEW.admin_reviewed_by := OLD.admin_reviewed_by; END IF;
    IF NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at THEN denied := denied || 'admin_reviewed_at'; NEW.admin_reviewed_at := OLD.admin_reviewed_at; END IF;
    IF NEW.admin_review_notes IS DISTINCT FROM OLD.admin_review_notes THEN denied := denied || 'admin_review_notes'; NEW.admin_review_notes := OLD.admin_review_notes; END IF;
    IF NEW.uses_count IS DISTINCT FROM OLD.uses_count THEN denied := denied || 'uses_count'; NEW.uses_count := OLD.uses_count; END IF;
    IF NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN denied := denied || 'activated_at'; NEW.activated_at := OLD.activated_at; END IF;
    IF NEW.expired_at IS DISTINCT FROM OLD.expired_at THEN denied := denied || 'expired_at'; NEW.expired_at := OLD.expired_at; END IF;
  END IF;
  IF array_length(denied,1) > 0 THEN
    PERFORM public.log_permission_denied('driver_proxy_billing_accounts', OLD.id::text,
      'Driver attempted to modify protected proxy billing fields', denied, '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

-- 2) Idempotency table for proxy actions
CREATE TABLE IF NOT EXISTS public.proxy_action_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  proxy_account_id UUID REFERENCES public.driver_proxy_billing_accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.proxy_action_idempotency TO authenticated;
GRANT ALL ON public.proxy_action_idempotency TO service_role;
ALTER TABLE public.proxy_action_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view idempotency" ON public.proxy_action_idempotency
  FOR SELECT TO authenticated USING (public.is_admin());

-- 3) Extend audit log with richer fields
ALTER TABLE public.proxy_billing_audit_log
  ADD COLUMN IF NOT EXISTS previous_state JSONB,
  ADD COLUMN IF NOT EXISTS new_state JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- 4) Driver update RPC (validity + use type) — driver-safe, only while pending
CREATE OR REPLACE FUNCTION public.driver_update_proxy_terms(
  _proxy_id UUID,
  _use_type TEXT,
  _validity_starts_at TIMESTAMPTZ,
  _validity_expires_at TIMESTAMPTZ,
  _max_uses INTEGER
) RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required' USING ERRCODE='42501'; END IF;
  IF _use_type NOT IN ('one_time','recurring') THEN RAISE EXCEPTION 'invalid use_type'; END IF;
  IF _validity_expires_at IS NOT NULL AND _validity_expires_at <= now() THEN
    RAISE EXCEPTION 'validity_expires_at must be in the future';
  END IF;
  IF _max_uses IS NOT NULL AND _max_uses < 1 THEN RAISE EXCEPTION 'max_uses must be >= 1'; END IF;

  UPDATE public.driver_proxy_billing_accounts
    SET use_type = _use_type,
        validity_starts_at = _validity_starts_at,
        validity_expires_at = _validity_expires_at,
        max_uses = CASE WHEN _use_type = 'one_time' THEN 1 ELSE _max_uses END
    WHERE id = _proxy_id
      AND driver_id = auth.uid()
      AND status IN ('pending','awaiting_consent','awaiting_review')
    RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'proxy not editable' USING ERRCODE='P0002'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.driver_update_proxy_terms(UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_update_proxy_terms(UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER) TO authenticated;

-- 5) Admin review RPC (approve / reject)
CREATE OR REPLACE FUNCTION public.admin_review_proxy_billing(
  _proxy_id UUID,
  _decision TEXT,        -- 'approved' | 'rejected'
  _notes TEXT DEFAULT NULL
) RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE='42501'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid decision'; END IF;

  UPDATE public.driver_proxy_billing_accounts
    SET admin_review_status = _decision,
        admin_reviewed_by = auth.uid(),
        admin_reviewed_at = now(),
        admin_review_notes = _notes,
        status = CASE
          WHEN _decision = 'rejected' THEN 'revoked'
          WHEN _decision = 'approved' AND card_token IS NOT NULL THEN 'active'
          WHEN _decision = 'approved' AND consent_status = 'signed' THEN 'awaiting_card'
          WHEN _decision = 'approved' THEN status
          ELSE status
        END,
        activated_at = CASE
          WHEN _decision = 'approved' AND card_token IS NOT NULL AND activated_at IS NULL THEN now()
          ELSE activated_at
        END,
        revoked_at = CASE WHEN _decision = 'rejected' THEN now() ELSE revoked_at END,
        revoked_by = CASE WHEN _decision = 'rejected' THEN auth.uid() ELSE revoked_by END,
        revoke_reason = CASE WHEN _decision = 'rejected' THEN COALESCE(_notes,'admin rejected') ELSE revoke_reason END
    WHERE id = _proxy_id
    RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details, previous_state, new_state)
  VALUES (r.id, r.driver_id, auth.uid(), 'admin', 'admin_review_' || _decision,
          jsonb_build_object('notes', _notes),
          jsonb_build_object('status', 'awaiting_review'),
          jsonb_build_object('status', r.status, 'admin_review_status', r.admin_review_status));

  -- Notify driver via inbox
  INSERT INTO public.inbox_messages(user_id, direction, channel, subject, body, status)
  VALUES (r.driver_id, 'inbound', 'system',
          'Proxy billing ' || _decision,
          'Your proxy billing request (' || r.proxy_full_name || ') was ' || _decision || '.' ||
          CASE WHEN _notes IS NOT NULL THEN ' Admin notes: ' || _notes ELSE '' END,
          'unread');
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_review_proxy_billing(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_proxy_billing(UUID,TEXT,TEXT) TO authenticated;

-- 6) Update revoke to invalidate card token immediately
CREATE OR REPLACE FUNCTION public.admin_revoke_proxy_billing(_proxy_id UUID, _reason TEXT)
RETURNS public.driver_proxy_billing_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts; prev jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('status', status, 'card_last4', card_last4) INTO prev
    FROM public.driver_proxy_billing_accounts WHERE id = _proxy_id;
  UPDATE public.driver_proxy_billing_accounts
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
        revoke_reason = COALESCE(_reason,'admin revoked'),
        consent_status = 'revoked',
        -- immediate effect on future payments: nuke the tokenized card reference
        card_token = NULL
    WHERE id = _proxy_id
    RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details, previous_state, new_state)
  VALUES (r.id, r.driver_id, auth.uid(), 'admin', 'admin_revoked',
          jsonb_build_object('reason', _reason),
          prev,
          jsonb_build_object('status','revoked','card_token', null));

  INSERT INTO public.inbox_messages(user_id, direction, channel, subject, body, status)
  VALUES (r.driver_id, 'inbound', 'system',
          'Proxy billing revoked',
          'Your proxy billing card (' || r.proxy_full_name || ') was revoked by an administrator. It will not be charged for future payments.' ||
          CASE WHEN _reason IS NOT NULL THEN ' Reason: ' || _reason ELSE '' END,
          'unread');
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_proxy_billing(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_proxy_billing(UUID,TEXT) TO authenticated;

-- 7) Consume a proxy charge (called by payment code before charging the token)
CREATE OR REPLACE FUNCTION public.consume_proxy_charge(_proxy_id UUID)
RETURNS TABLE(ok BOOLEAN, reason TEXT, card_token TEXT, provider TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.driver_proxy_billing_accounts;
BEGIN
  SELECT * INTO r FROM public.driver_proxy_billing_accounts WHERE id = _proxy_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found', NULL::text, NULL::text; RETURN; END IF;
  IF r.status <> 'active' THEN RETURN QUERY SELECT false, 'not_active:'||r.status, NULL::text, NULL::text; RETURN; END IF;
  IF r.admin_review_status <> 'approved' THEN RETURN QUERY SELECT false, 'not_approved', NULL::text, NULL::text; RETURN; END IF;
  IF r.card_token IS NULL THEN RETURN QUERY SELECT false, 'no_card', NULL::text, NULL::text; RETURN; END IF;
  IF r.validity_starts_at IS NOT NULL AND now() < r.validity_starts_at THEN
    RETURN QUERY SELECT false, 'not_yet_valid', NULL::text, NULL::text; RETURN; END IF;
  IF r.validity_expires_at IS NOT NULL AND now() > r.validity_expires_at THEN
    UPDATE public.driver_proxy_billing_accounts SET status='expired', expired_at=now() WHERE id=r.id;
    RETURN QUERY SELECT false, 'expired', NULL::text, NULL::text; RETURN;
  END IF;
  IF r.max_uses IS NOT NULL AND r.uses_count >= r.max_uses THEN
    UPDATE public.driver_proxy_billing_accounts SET status='used', expired_at=now() WHERE id=r.id;
    RETURN QUERY SELECT false, 'usage_exhausted', NULL::text, NULL::text; RETURN;
  END IF;

  UPDATE public.driver_proxy_billing_accounts
    SET uses_count = uses_count + 1,
        status = CASE
          WHEN use_type='one_time' OR (max_uses IS NOT NULL AND uses_count + 1 >= max_uses) THEN 'used'
          ELSE status
        END,
        expired_at = CASE
          WHEN use_type='one_time' OR (max_uses IS NOT NULL AND uses_count + 1 >= max_uses) THEN now()
          ELSE expired_at
        END
    WHERE id = r.id;

  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details)
  VALUES (r.id, r.driver_id, auth.uid(), 'system', 'charge_consumed',
          jsonb_build_object('uses_count', r.uses_count + 1, 'max_uses', r.max_uses, 'use_type', r.use_type));

  RETURN QUERY SELECT true, 'ok', r.card_token, r.card_provider;
END $$;
REVOKE ALL ON FUNCTION public.consume_proxy_charge(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_proxy_charge(UUID) TO service_role, authenticated;

-- 8) Notify driver on consent signed and card activation
CREATE OR REPLACE FUNCTION public.notify_proxy_state_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- consent signed
  IF NEW.consent_status = 'signed' AND OLD.consent_status IS DISTINCT FROM 'signed' THEN
    INSERT INTO public.inbox_messages(user_id, direction, channel, subject, body, status)
    VALUES (NEW.driver_id, 'inbound', 'system',
            'Proxy consent signed',
            NEW.proxy_full_name || ' has signed the proxy billing consent. Awaiting admin approval and card activation.',
            'unread');
    -- flip to awaiting_review if not already reviewed
    IF NEW.admin_review_status = 'pending' AND NEW.status <> 'awaiting_review' THEN
      NEW.status := 'awaiting_review';
    END IF;
  END IF;
  -- identity verified
  IF NEW.identity_status = 'verified' AND OLD.identity_status IS DISTINCT FROM 'verified' THEN
    INSERT INTO public.inbox_messages(user_id, direction, channel, subject, body, status)
    VALUES (NEW.driver_id, 'inbound', 'system',
            'Proxy identity verified',
            NEW.proxy_full_name || ' passed identity verification. They can now sign the consent form.',
            'unread');
  END IF;
  -- activated
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    IF NEW.activated_at IS NULL THEN NEW.activated_at := now(); END IF;
    INSERT INTO public.inbox_messages(user_id, direction, channel, subject, body, status)
    VALUES (NEW.driver_id, 'inbound', 'system',
            'Proxy card ready',
            NEW.proxy_full_name || '''s card is active and available for your rental payments.',
            'unread');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_proxy_state ON public.driver_proxy_billing_accounts;
CREATE TRIGGER trg_notify_proxy_state
BEFORE UPDATE ON public.driver_proxy_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.notify_proxy_state_changes();

-- 9) When consent is signed, auto-flip to awaiting_review inside submit_proxy_consent
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
  IF r.status IN ('revoked','disabled','expired','used') THEN RAISE EXCEPTION 'proxy account is not active'; END IF;

  UPDATE public.driver_proxy_billing_accounts
    SET consent_status='signed', consent_signed_at=now(),
        consent_signature=_signature, consent_ip=_ip, consent_user_agent=_user_agent,
        status='awaiting_review'
    WHERE id = r.id RETURNING * INTO r;

  INSERT INTO public.proxy_billing_audit_log(proxy_account_id, driver_id, actor_id, actor_role, action, details, previous_state, new_state, ip_address, user_agent)
  VALUES (r.id, r.driver_id, NULL, 'proxy', 'consent_signed',
          jsonb_build_object('signature_length', length(_signature)),
          jsonb_build_object('consent_status','pending','status','awaiting_consent'),
          jsonb_build_object('consent_status','signed','status','awaiting_review'),
          _ip, _user_agent);
  RETURN r;
END $$;
