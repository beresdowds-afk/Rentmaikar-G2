-- Contact settings for admin-managed contact points per region
CREATE TABLE public.contact_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'whatsapp', 'sms')),
  contact_value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(region, contact_type)
);

-- Inbox conversations (threads)
CREATE TABLE public.inbox_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_email TEXT,
  user_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES auth.users(id),
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Individual messages within conversations
CREATE TABLE public.inbox_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin', 'system')),
  sender_id UUID REFERENCES auth.users(id),
  sender_name TEXT,
  content TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  external_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- Contact settings policies
CREATE POLICY "Anyone can view active contact settings"
  ON public.contact_settings FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage contact settings"
  ON public.contact_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Conversation policies
CREATE POLICY "Admins can manage all conversations"
  ON public.inbox_conversations FOR ALL
  USING (is_admin());

CREATE POLICY "Users can view their own conversations"
  ON public.inbox_conversations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create conversations"
  ON public.inbox_conversations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Message policies
CREATE POLICY "Admins can manage all messages"
  ON public.inbox_messages FOR ALL
  USING (is_admin());

CREATE POLICY "Users can view messages in their conversations"
  ON public.inbox_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_conversations 
      WHERE id = inbox_messages.conversation_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to their conversations"
  ON public.inbox_messages FOR INSERT
  WITH CHECK (
    sender_type = 'user' AND
    EXISTS (
      SELECT 1 FROM public.inbox_conversations 
      WHERE id = inbox_messages.conversation_id 
      AND user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_conversations_user_id ON public.inbox_conversations(user_id);
CREATE INDEX idx_conversations_status ON public.inbox_conversations(status);
CREATE INDEX idx_conversations_channel ON public.inbox_conversations(channel);
CREATE INDEX idx_conversations_last_message ON public.inbox_conversations(last_message_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.inbox_messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.inbox_messages(created_at DESC);

-- Triggers for updated_at
CREATE TRIGGER update_contact_settings_updated_at
  BEFORE UPDATE ON public.contact_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inbox_conversations_updated_at
  BEFORE UPDATE ON public.inbox_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default contact settings
INSERT INTO public.contact_settings (region, contact_type, contact_value, display_name) VALUES
  ('USA', 'email', 'support@rentmaikar.com', 'USA Support Email'),
  ('USA', 'sms', '+12403930081', 'USA SMS Line'),
  ('USA', 'whatsapp', '+12403930081', 'USA WhatsApp'),
  ('Nigeria', 'email', 'support@rentmaikar.com', 'Nigeria Support Email'),
  ('Nigeria', 'sms', '+2348035550123', 'Nigeria SMS Line'),
  ('Nigeria', 'whatsapp', '+2348035550123', 'Nigeria WhatsApp');