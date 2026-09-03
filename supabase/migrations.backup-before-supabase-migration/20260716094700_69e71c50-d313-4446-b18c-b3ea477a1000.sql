
-- 1) Roadside available to drivers as well
UPDATE public.subscription_plans
SET eligible_roles = ARRAY['driver','owner']::text[]
WHERE plan_type = 'roadside_support';

-- 2) Seed Insurance plans if absent
INSERT INTO public.subscription_plans (name, description, plan_type, price, currency, billing_interval, region, eligible_roles, is_active)
SELECT 'Driver Insurance - USA',
       'Rideshare-friendly insurance coverage. Requires an active Driver Training subscription.',
       'insurance', 49, 'USD', 'monthly', 'USA', ARRAY['driver']::text[], true
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_type='insurance' AND region='USA');

INSERT INTO public.subscription_plans (name, description, plan_type, price, currency, billing_interval, region, eligible_roles, is_active)
SELECT 'Driver Insurance - Nigeria',
       'Comprehensive rideshare insurance. Requires an active Driver Training subscription.',
       'insurance', 15000, 'NGN', 'monthly', 'Nigeria', ARRAY['driver']::text[], true
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE plan_type='insurance' AND region='Nigeria');

-- 3) Helper: does user have active subscription of a given plan_type (and optionally region)?
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid, _plan_type text, _region text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions us
    JOIN public.subscription_plans p ON p.id = us.plan_id
    WHERE us.user_id = _user_id
      AND us.status = 'active'
      AND us.expires_at > now()
      AND p.plan_type = _plan_type
      AND (_region IS NULL OR p.region = _region)
  )
$$;

-- 4) Prevent duplicate active subscriptions per user+plan_type via trigger
CREATE OR REPLACE FUNCTION public._enforce_single_active_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_type text;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT plan_type INTO v_plan_type FROM public.subscription_plans WHERE id = NEW.plan_id;
  IF EXISTS (
    SELECT 1 FROM public.user_subscriptions us
    JOIN public.subscription_plans p ON p.id = us.plan_id
    WHERE us.user_id = NEW.user_id
      AND us.status = 'active'
      AND p.plan_type = v_plan_type
      AND us.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'User already has an active % subscription', v_plan_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_active_subscription ON public.user_subscriptions;
CREATE TRIGGER enforce_single_active_subscription
  BEFORE INSERT OR UPDATE OF status, plan_id ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._enforce_single_active_subscription();

-- 5) Activate subscription (server-side only, after payment verification)
CREATE OR REPLACE FUNCTION public.activate_user_subscription(
  _user_id uuid,
  _plan_id uuid,
  _payment_reference text,
  _payment_method text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
  v_expires timestamptz;
  v_sub_id uuid;
BEGIN
  IF _user_id IS NULL OR _plan_id IS NULL THEN
    RAISE EXCEPTION 'user_id and plan_id are required';
  END IF;
  IF _payment_reference IS NULL OR length(_payment_reference) < 4 THEN
    RAISE EXCEPTION 'payment_reference required';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = _plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found or inactive'; END IF;

  IF v_plan.plan_type = 'insurance'
     AND NOT public.has_active_subscription(_user_id, 'training', v_plan.region) THEN
    RAISE EXCEPTION 'Driver training subscription required before insurance';
  END IF;

  -- Idempotency
  SELECT id INTO v_sub_id FROM public.user_subscriptions
    WHERE user_id = _user_id AND payment_reference = _payment_reference AND status = 'active';
  IF FOUND THEN RETURN v_sub_id; END IF;

  v_expires := CASE v_plan.billing_interval
    WHEN 'daily'   THEN now() + interval '1 day'
    WHEN 'weekly'  THEN now() + interval '7 days'
    WHEN 'monthly' THEN now() + interval '1 month'
    WHEN 'yearly'  THEN now() + interval '1 year'
    ELSE now() + interval '1 month'
  END;

  -- Deactivate any prior active sub of same plan_type
  UPDATE public.user_subscriptions us
     SET status = 'replaced', updated_at = now()
   FROM public.subscription_plans p
   WHERE us.plan_id = p.id
     AND us.user_id = _user_id
     AND us.status = 'active'
     AND p.plan_type = v_plan.plan_type;

  INSERT INTO public.user_subscriptions
    (user_id, plan_id, status, started_at, expires_at, payment_reference, payment_method, auto_renew)
  VALUES
    (_user_id, _plan_id, 'active', now(), v_expires, _payment_reference, _payment_method, true)
  RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_user_subscription(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_user_subscription(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text) TO authenticated, service_role;

-- 6) RLS: users see their own subs; authenticated can view active plans
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_subscriptions' AND policyname='Users view their own subscriptions') THEN
    CREATE POLICY "Users view their own subscriptions"
      ON public.user_subscriptions FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscription_plans' AND policyname='Anyone authenticated can view active plans') THEN
    CREATE POLICY "Anyone authenticated can view active plans"
      ON public.subscription_plans FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;
