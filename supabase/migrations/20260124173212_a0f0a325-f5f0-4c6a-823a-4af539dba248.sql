-- Create table for VoIP feature settings
CREATE TABLE public.voip_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  region TEXT NOT NULL DEFAULT 'All' CHECK (region IN ('USA', 'Nigeria', 'All')),
  description TEXT,
  updated_by UUID REFERENCES public.profiles(user_id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voip_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage VoIP settings" ON public.voip_settings
  FOR ALL USING (public.is_admin());

CREATE POLICY "Anyone can view VoIP settings" ON public.voip_settings
  FOR SELECT USING (true);

-- Insert default settings
INSERT INTO public.voip_settings (feature_key, is_enabled, region, description) VALUES
  ('user_call_support', false, 'All', 'Allow drivers and owners to call admin support'),
  ('driver_call_support', false, 'All', 'Allow drivers to call admin support'),
  ('owner_call_support', false, 'All', 'Allow owners to call admin support');

-- Create table for user call requests (for tracking/queuing)
CREATE TABLE public.voip_call_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id),
  user_type TEXT NOT NULL CHECK (user_type IN ('driver', 'owner')),
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'callback_scheduled', 'called_back', 'canceled', 'missed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  reason TEXT,
  admin_notes TEXT,
  callback_scheduled_at TIMESTAMP WITH TIME ZONE,
  called_back_at TIMESTAMP WITH TIME ZONE,
  called_back_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voip_call_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call requests
CREATE POLICY "Admins can manage all call requests" ON public.voip_call_requests
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can create their own call requests" ON public.voip_call_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own call requests" ON public.voip_call_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can cancel their pending requests" ON public.voip_call_requests
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending');

-- Add trigger for updated_at
CREATE TRIGGER update_voip_settings_updated_at
  BEFORE UPDATE ON public.voip_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_voip_call_requests_updated_at
  BEFORE UPDATE ON public.voip_call_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for call requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.voip_call_requests;