-- Deploy missing column-scope triggers and add profiles guard

-- driver_proxy_billing_accounts
DROP TRIGGER IF EXISTS trg_enforce_proxy_driver_column_scope ON public.driver_proxy_billing_accounts;
CREATE TRIGGER trg_enforce_proxy_driver_column_scope
  BEFORE UPDATE ON public.driver_proxy_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_proxy_driver_column_scope();

-- user_subscriptions
DROP TRIGGER IF EXISTS trg_enforce_user_subscription_column_scope ON public.user_subscriptions;
CREATE TRIGGER trg_enforce_user_subscription_column_scope
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_subscription_column_scope();

-- support_tasks
DROP TRIGGER IF EXISTS trg_enforce_support_task_staff_scope ON public.support_tasks;
CREATE TRIGGER trg_enforce_support_task_staff_scope
  BEFORE UPDATE ON public.support_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_support_task_staff_scope();

-- voice_call_requests
DROP TRIGGER IF EXISTS trg_enforce_voice_call_request_scope ON public.voice_call_requests;
CREATE TRIGGER trg_enforce_voice_call_request_scope
  BEFORE UPDATE ON public.voice_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voice_call_request_scope();

-- voip_call_requests
DROP TRIGGER IF EXISTS trg_enforce_voip_call_request_cancel_scope ON public.voip_call_requests;
CREATE TRIGGER trg_enforce_voip_call_request_cancel_scope
  BEFORE UPDATE ON public.voip_call_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_voip_call_request_cancel_scope();

-- Profiles: restrict self-service updates to safe personal fields only.
CREATE OR REPLACE FUNCTION public.enforce_profile_column_scope()
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

  IF NEW.access_level IS DISTINCT FROM OLD.access_level
     OR NEW.persona_verified IS DISTINCT FROM OLD.persona_verified
     OR NEW.referee_verified IS DISTINCT FROM OLD.referee_verified
     OR NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status
     OR NEW.payment_proxy_verified IS DISTINCT FROM OLD.payment_proxy_verified
     OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
     OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
     OR NEW.payments_suspended IS DISTINCT FROM OLD.payments_suspended
     OR NEW.daily_plan_forbidden IS DISTINCT FROM OLD.daily_plan_forbidden
     OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
     OR NEW.identity_verified_inquiry_id IS DISTINCT FROM OLD.identity_verified_inquiry_id
     OR NEW.phone_verification_code IS DISTINCT FROM OLD.phone_verification_code
     OR NEW.phone_verification_expires_at IS DISTINCT FROM OLD.phone_verification_expires_at
     OR NEW.daily_plan_forbidden_at IS DISTINCT FROM OLD.daily_plan_forbidden_at
     OR NEW.daily_plan_forbidden_reason IS DISTINCT FROM OLD.daily_plan_forbidden_reason
     OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.suspended_call_in_id IS DISTINCT FROM OLD.suspended_call_in_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.public_uuid IS DISTINCT FROM OLD.public_uuid
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at
     OR NEW.registration_stage IS DISTINCT FROM OLD.registration_stage
     OR NEW.stage_updated_at IS DISTINCT FROM OLD.stage_updated_at
  THEN
    RAISE EXCEPTION 'Users may only update personal fields (full_name, phone, avatar, notification preferences, etc.) on their own profile'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_column_scope ON public.profiles;
CREATE TRIGGER trg_enforce_profile_column_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_column_scope();

-- Also tighten the policy WITH CHECK to be explicit (defence in depth).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());