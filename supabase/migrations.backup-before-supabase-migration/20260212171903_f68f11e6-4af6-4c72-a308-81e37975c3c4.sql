
-- Training modules table
CREATE TABLE public.training_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  module_order INTEGER NOT NULL DEFAULT 0,
  script_content TEXT,
  video_url TEXT,
  duration_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  region TEXT NOT NULL DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all training modules"
ON public.training_modules FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated users can view active training modules"
ON public.training_modules FOR SELECT USING (is_active = true);

-- Training completions table
CREATE TABLE public.training_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  module_id UUID NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  score INTEGER,
  UNIQUE(user_id, module_id)
);

ALTER TABLE public.training_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own completions"
ON public.training_completions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own completions"
ON public.training_completions FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all completions"
ON public.training_completions FOR ALL USING (is_admin());

-- Subscription plans table
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  plan_type TEXT NOT NULL, -- 'training', 'roadside_support'
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_interval TEXT NOT NULL DEFAULT 'yearly', -- 'monthly', 'yearly'
  region TEXT NOT NULL,
  eligible_roles TEXT[] NOT NULL DEFAULT '{}', -- 'driver', 'owner'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription plans"
ON public.subscription_plans FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage subscription plans"
ON public.subscription_plans FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- User subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled', 'pending'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_reference TEXT,
  payment_method TEXT,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
ON public.user_subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own subscriptions"
ON public.user_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own subscriptions"
ON public.user_subscriptions FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all subscriptions"
ON public.user_subscriptions FOR ALL USING (is_admin());

-- Roadside support partners table
CREATE TABLE public.roadside_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  service_type TEXT NOT NULL, -- 'towing', 'tire_change', 'lockout', 'fuel_delivery', 'battery_jump', 'general'
  coverage_area TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'USA',
  is_active BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC DEFAULT 0,
  response_time_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roadside_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active roadside partners"
ON public.roadside_partners FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage roadside partners"
ON public.roadside_partners FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Training refresh tracking
CREATE TABLE public.training_refresh_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  last_completed_at TIMESTAMP WITH TIME ZONE,
  next_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'overdue'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.training_refresh_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own refresh requirements"
ON public.training_refresh_requirements FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all refresh requirements"
ON public.training_refresh_requirements FOR ALL USING (is_admin());

CREATE POLICY "Users can update their own refresh status"
ON public.training_refresh_requirements FOR UPDATE USING (user_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_training_modules_updated_at BEFORE UPDATE ON public.training_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_roadside_partners_updated_at BEFORE UPDATE ON public.roadside_partners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_refresh_updated_at BEFORE UPDATE ON public.training_refresh_requirements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for training videos
INSERT INTO storage.buckets (id, name, public) VALUES ('training-media', 'training-media', true);

CREATE POLICY "Anyone can view training media"
ON storage.objects FOR SELECT USING (bucket_id = 'training-media');

CREATE POLICY "Admins can upload training media"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'training-media' AND is_admin());

CREATE POLICY "Admins can update training media"
ON storage.objects FOR UPDATE USING (bucket_id = 'training-media' AND is_admin());

CREATE POLICY "Admins can delete training media"
ON storage.objects FOR DELETE USING (bucket_id = 'training-media' AND is_admin());
