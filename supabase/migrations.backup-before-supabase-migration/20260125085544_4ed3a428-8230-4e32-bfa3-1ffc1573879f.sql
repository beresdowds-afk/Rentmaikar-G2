-- Create table for API keys
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["read"]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  allowed_origins TEXT[] DEFAULT '{}'::text[]
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can manage API keys
CREATE POLICY "Admins can manage all API keys"
ON public.api_keys
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Create index for faster lookups
CREATE INDEX idx_api_keys_prefix ON public.api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON public.api_keys(is_active) WHERE is_active = true;

-- Create API key usage log table
CREATE TABLE public.api_key_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_key_usage_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view usage logs
CREATE POLICY "Admins can view API key usage logs"
ON public.api_key_usage_log
FOR SELECT
USING (is_admin());

-- Only system can insert logs (via service role)
CREATE POLICY "System can insert usage logs"
ON public.api_key_usage_log
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_api_key_usage_log_key_id ON public.api_key_usage_log(api_key_id);
CREATE INDEX idx_api_key_usage_log_created_at ON public.api_key_usage_log(created_at DESC);