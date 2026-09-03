
-- WhatsApp messages table
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text UNIQUE,
  user_id uuid,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL CHECK (message_type IN ('text', 'image', 'document', 'interactive', 'template', 'location', 'audio', 'video')),
  content text,
  media_url text,
  template_name text,
  language text,
  status text DEFAULT 'pending',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all whatsapp messages" ON public.whatsapp_messages FOR ALL USING (is_admin());
CREATE POLICY "System can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own messages" ON public.whatsapp_messages FOR SELECT USING (user_id = auth.uid());

CREATE INDEX idx_whatsapp_messages_user ON public.whatsapp_messages(user_id);
CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);
CREATE INDEX idx_whatsapp_messages_direction ON public.whatsapp_messages(direction, created_at DESC);

-- Message delivery status tracking
CREATE TABLE public.whatsapp_message_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text REFERENCES public.whatsapp_messages(message_id) ON DELETE CASCADE,
  status text NOT NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_message_delivery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all delivery records" ON public.whatsapp_message_delivery FOR ALL USING (is_admin());
CREATE POLICY "System can insert delivery records" ON public.whatsapp_message_delivery FOR INSERT WITH CHECK (true);

CREATE INDEX idx_whatsapp_delivery_message ON public.whatsapp_message_delivery(message_id);

-- Interactive message flows
CREATE TABLE public.whatsapp_interactive_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id text,
  user_id uuid,
  flow_type text NOT NULL,
  current_step integer DEFAULT 0,
  data jsonb DEFAULT '{}',
  completed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_interactive_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all flows" ON public.whatsapp_interactive_flows FOR ALL USING (is_admin());
CREATE POLICY "System can insert flows" ON public.whatsapp_interactive_flows FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update flows" ON public.whatsapp_interactive_flows FOR UPDATE USING (true);
CREATE POLICY "Users can view their own flows" ON public.whatsapp_interactive_flows FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER update_whatsapp_flows_updated_at BEFORE UPDATE ON public.whatsapp_interactive_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- WhatsApp sessions
CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_data jsonb DEFAULT '{}',
  last_activity timestamptz DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sessions" ON public.whatsapp_sessions FOR ALL USING (is_admin());
CREATE POLICY "System can insert sessions" ON public.whatsapp_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update sessions" ON public.whatsapp_sessions FOR UPDATE USING (true);

CREATE INDEX idx_whatsapp_sessions_user ON public.whatsapp_sessions(user_id);
CREATE INDEX idx_whatsapp_sessions_expires ON public.whatsapp_sessions(expires_at);

-- Template usage tracking
CREATE TABLE public.whatsapp_template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  language text,
  user_id uuid,
  status text DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_template_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all template usage" ON public.whatsapp_template_usage FOR ALL USING (is_admin());
CREATE POLICY "System can insert template usage" ON public.whatsapp_template_usage FOR INSERT WITH CHECK (true);

CREATE INDEX idx_template_usage_name ON public.whatsapp_template_usage(template_name);
CREATE INDEX idx_template_usage_created ON public.whatsapp_template_usage(created_at DESC);

-- Also add the analytics columns to unified_message_log from previous request
ALTER TABLE public.unified_message_log
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS response_time_ms integer,
  ADD COLUMN IF NOT EXISTS interactive_reply boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_unified_message_log_analytics ON public.unified_message_log(direction, delivery_status, created_at DESC);
