-- Create table to store VoIP call logs
CREATE TABLE public.voip_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid TEXT UNIQUE,
  initiated_by UUID REFERENCES public.profiles(user_id),
  call_type TEXT NOT NULL CHECK (call_type IN ('individual', 'group')),
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for call participants (supports group calls)
CREATE TABLE public.voip_call_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.voip_calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(user_id),
  phone_number TEXT NOT NULL,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('caller', 'recipient')),
  display_name TEXT,
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'connected', 'disconnected', 'failed')),
  joined_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for call groups (predefined groups for conference calls)
CREATE TABLE public.voip_call_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria', 'All')),
  created_by UUID REFERENCES public.profiles(user_id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for group members
CREATE TABLE public.voip_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.voip_call_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(user_id),
  phone_number TEXT NOT NULL,
  display_name TEXT,
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voip_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_call_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for voip_calls (admin only for now)
CREATE POLICY "Admins can manage all calls" ON public.voip_calls
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view calls they initiated or participated in" ON public.voip_calls
  FOR SELECT USING (
    auth.uid() = initiated_by OR
    EXISTS (
      SELECT 1 FROM public.voip_call_participants
      WHERE call_id = voip_calls.id AND user_id = auth.uid()
    )
  );

-- RLS Policies for voip_call_participants
CREATE POLICY "Admins can manage all participants" ON public.voip_call_participants
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view their own participation" ON public.voip_call_participants
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policies for voip_call_groups
CREATE POLICY "Admins can manage all groups" ON public.voip_call_groups
  FOR ALL USING (public.is_admin());

CREATE POLICY "Active groups visible to all authenticated users" ON public.voip_call_groups
  FOR SELECT USING (is_active = true AND auth.uid() IS NOT NULL);

-- RLS Policies for voip_group_members
CREATE POLICY "Admins can manage all group members" ON public.voip_group_members
  FOR ALL USING (public.is_admin());

CREATE POLICY "Users can view group memberships" ON public.voip_group_members
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add triggers for updated_at
CREATE TRIGGER update_voip_calls_updated_at
  BEFORE UPDATE ON public.voip_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_voip_call_groups_updated_at
  BEFORE UPDATE ON public.voip_call_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.voip_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voip_call_participants;