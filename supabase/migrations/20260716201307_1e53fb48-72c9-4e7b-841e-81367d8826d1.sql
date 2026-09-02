
-- Admin cancel subscription with immediate expiration + cascade to insurance if training is cancelled
CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(_subscription_id uuid, _reason text DEFAULT NULL)
RETURNS TABLE(cancelled_id uuid, cascaded_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_cascade uuid[] := '{}';
  v_row uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may cancel subscriptions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.user_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sub.status <> 'active' THEN
    RAISE EXCEPTION 'Subscription is not active (status=%)', v_sub.status;
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;

  UPDATE public.user_subscriptions
     SET status = 'cancelled', expires_at = now(), auto_renew = false, updated_at = now()
   WHERE id = _subscription_id;

  -- Cascade: cancelling training also cancels dependent active insurance in same region
  IF v_plan.plan_type = 'training' THEN
    FOR v_row IN
      SELECT us.id
        FROM public.user_subscriptions us
        JOIN public.subscription_plans p ON p.id = us.plan_id
       WHERE us.user_id = v_sub.user_id
         AND us.status = 'active'
         AND p.plan_type = 'insurance'
         AND p.region = v_plan.region
    LOOP
      UPDATE public.user_subscriptions
         SET status = 'cancelled', expires_at = now(), auto_renew = false, updated_at = now()
       WHERE id = v_row;
      v_cascade := v_cascade || v_row;
    END LOOP;
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'subscription_cancelled', 'user_subscriptions', _subscription_id::text,
          jsonb_build_object(
            'reason', _reason,
            'plan_type', v_plan.plan_type,
            'region', v_plan.region,
            'user_id', v_sub.user_id,
            'cascaded_insurance', v_cascade
          ));

  RETURN QUERY SELECT _subscription_id, v_cascade;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) TO authenticated;
