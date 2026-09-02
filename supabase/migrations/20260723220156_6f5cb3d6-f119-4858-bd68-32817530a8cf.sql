
-- ============================================================================
-- Security hardening: column-scoped update guards + SECURITY DEFINER cleanup
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) driver_proxy_billing_accounts: block drivers from editing admin/verify
--    controlled fields on their own row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_proxy_driver_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Service role / admins bypass this guard entirely.
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only applies when the driver themselves is updating their row.
  IF auth.uid() IS DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  -- Verification / admin-review fields
  IF NEW.admin_review_status IS DISTINCT FROM OLD.admin_review_status
     OR NEW.admin_reviewed_by IS DISTINCT FROM OLD.admin_reviewed_by
     OR NEW.admin_reviewed_at IS DISTINCT FROM OLD.admin_reviewed_at
     OR NEW.admin_review_notes IS DISTINCT FROM OLD.admin_review_notes
     OR NEW.identity_status IS DISTINCT FROM OLD.identity_status
     OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
     OR NEW.persona_inquiry_id IS DISTINCT FROM OLD.persona_inquiry_id
     OR NEW.consent_status IS DISTINCT FROM OLD.consent_status
     OR NEW.consent_signed_at IS DISTINCT FROM OLD.consent_signed_at
     OR NEW.consent_signature IS DISTINCT FROM OLD.consent_signature
     OR NEW.consent_ip IS DISTINCT FROM OLD.consent_ip
     OR NEW.consent_user_agent IS DISTINCT FROM OLD.consent_user_agent
     OR NEW.consent_pdf_url IS DISTINCT FROM OLD.consent_pdf_url
     OR NEW.consent_token IS DISTINCT FROM OLD.consent_token
     OR NEW.consent_token_expires_at IS DISTINCT FROM OLD.consent_token_expires_at
     OR NEW.consent_sent_at IS DISTINCT FROM OLD.consent_sent_at
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
     OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
     OR NEW.revoke_reason IS DISTINCT FROM OLD.revoke_reason
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.expired_at IS DISTINCT FROM OLD.expired_at
     OR NEW.uses_count IS DISTINCT FROM OLD.uses_count
     -- Card / payment fields (must go through provider tokenisation, not driver)
     OR NEW.card_provider IS DISTINCT FROM OLD.card_provider
     OR NEW.card_token IS DISTINCT FROM OLD.card_token
     OR NEW.card_last4 IS DISTINCT FROM OLD.card_last4
     OR NEW.card_brand IS DISTINCT FROM OLD.card_brand
     OR NEW.card_exp_month IS DISTINCT FROM OLD.card_exp_month
     OR NEW.card_exp_year IS DISTINCT FROM OLD.card_exp_year
     OR NEW.card_fingerprint IS DISTINCT FROM OLD.card_fingerprint
     -- Ownership must not change
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
  THEN
    RAISE EXCEPTION 'Drivers may only edit contact, consent-channel, validity and notification preferences on their proxy account'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_proxy_driver_column_scope
  ON public.driver_proxy_billing_accounts;
CREATE TRIGGER trg_enforce_proxy_driver_column_scope
  BEFORE UPDATE ON public.driver_proxy_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_proxy_driver_column_scope();

-- ---------------------------------------------------------------------------
-- 2) user_subscriptions: users may only toggle auto_renew on their own row.
--    plan_id / status / expires_at / payment_* must go through payment flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_user_subscription_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Only auto_renew may be changed by the subscription owner; plan / status / expiry changes must go through the payment flow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_subscription_column_scope
  ON public.user_subscriptions;
CREATE TRIGGER trg_enforce_user_subscription_column_scope
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_subscription_column_scope();

-- Also tighten the policy WITH CHECK to reject cross-user reassignment.
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can update their own subscriptions"
  ON public.user_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) support_tasks: assigned staff may only update workflow fields, not the
--    task's ownership, subject records or reassign it to somebody else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_support_task_staff_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Only enforce when the actor is support staff assigned to this task.
  IF NOT EXISTS (
    SELECT 1
    FROM public.support_staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.id = OLD.assigned_to
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.task_type IS DISTINCT FROM OLD.task_type
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.device_id IS DISTINCT FROM OLD.device_id
     OR NEW.recall_id IS DISTINCT FROM OLD.recall_id
     OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Support staff may only update workflow fields (status, resolution, scheduling, notes, priority) on assigned support tasks'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_support_task_staff_scope
  ON public.support_tasks;
CREATE TRIGGER trg_enforce_support_task_staff_scope
  BEFORE UPDATE ON public.support_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_support_task_staff_scope();

-- Add explicit WITH CHECK to the RLS policy so post-update assigned_to still
-- resolves to the same staff member.
DROP POLICY IF EXISTS "Support staff can update assigned tasks" ON public.support_tasks;
CREATE POLICY "Support staff can update assigned tasks"
  ON public.support_tasks
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to IN (
      SELECT support_staff.id
      FROM public.support_staff
      WHERE support_staff.user_id = auth.uid()
        AND support_staff.is_active = true
    )
  )
  WITH CHECK (
    assigned_to IN (
      SELECT support_staff.id
      FROM public.support_staff
      WHERE support_staff.user_id = auth.uid()
        AND support_staff.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- 4) voice_call_requests: assigned/support staff can only advance workflow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_voice_call_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.requester_role IS DISTINCT FROM OLD.requester_role
     OR NEW.target_role IS DISTINCT FROM OLD.target_role
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only status, assigned_to, call_id and resolved_at may be updated on voice call requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_voice_call_request_scope
  ON public.voice_call_requests;
CREATE TRIGGER trg_enforce_voice_call_request_scope
  BEFORE UPDATE ON public.voice_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voice_call_request_scope();

DROP POLICY IF EXISTS "Support staff can update assigned requests" ON public.voice_call_requests;
CREATE POLICY "Support staff can update assigned requests"
  ON public.voice_call_requests
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() OR public.is_any_support_staff(auth.uid()))
  WITH CHECK (assigned_to = auth.uid() OR public.is_any_support_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5) voip_call_requests: users may only cancel their own pending request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_voip_call_request_cancel_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.is_any_support_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Users can only cancel: status must move pending -> cancelled and nothing else changes.
  IF NEW.status IS DISTINCT FROM 'cancelled'
     OR OLD.status IS DISTINCT FROM 'pending'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.user_type IS DISTINCT FROM OLD.user_type
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.callback_scheduled_at IS DISTINCT FROM OLD.callback_scheduled_at
     OR NEW.called_back_at IS DISTINCT FROM OLD.called_back_at
     OR NEW.called_back_by IS DISTINCT FROM OLD.called_back_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Users may only cancel their own pending voip call request; other changes require support staff or admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_voip_call_request_cancel_scope
  ON public.voip_call_requests;
CREATE TRIGGER trg_enforce_voip_call_request_cancel_scope
  BEFORE UPDATE ON public.voip_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voip_call_request_cancel_scope();

DROP POLICY IF EXISTS "Users can cancel their pending requests" ON public.voip_call_requests;
CREATE POLICY "Users can cancel their pending requests"
  ON public.voip_call_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

-- ---------------------------------------------------------------------------
-- 6) SECURITY DEFINER anon-executable: admin_create_staff_role must never
--    be callable without an authenticated admin caller.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_create_staff_role(uuid, app_role) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 7) touch_persona_template_config: pin search_path.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.touch_persona_template_config() SET search_path = public;
