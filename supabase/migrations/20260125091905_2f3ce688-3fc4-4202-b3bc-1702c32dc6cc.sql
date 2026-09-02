-- Create webhooks table for managing webhook configurations
CREATE TABLE public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  retry_count INTEGER NOT NULL DEFAULT 3,
  timeout_seconds INTEGER NOT NULL DEFAULT 30,
  headers JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0
);

-- Create webhook delivery logs table
CREATE TABLE public.webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_headers JSONB,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create API validation endpoints table
CREATE TABLE public.api_validation_endpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  request_schema JSONB,
  response_schema JSONB,
  rate_limit_per_minute INTEGER DEFAULT 60,
  requires_auth BOOLEAN NOT NULL DEFAULT true,
  required_permissions TEXT[] DEFAULT '{}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  version TEXT NOT NULL DEFAULT 'v1',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_validation_endpoints ENABLE ROW LEVEL SECURITY;

-- RLS policies for webhooks
CREATE POLICY "Admins can manage all webhooks"
  ON public.webhooks
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- RLS policies for webhook deliveries
CREATE POLICY "Admins can view all webhook deliveries"
  ON public.webhook_deliveries
  FOR SELECT
  USING (is_admin());

CREATE POLICY "System can insert webhook deliveries"
  ON public.webhook_deliveries
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can delete webhook deliveries"
  ON public.webhook_deliveries
  FOR DELETE
  USING (is_admin());

-- RLS policies for API validation endpoints
CREATE POLICY "Admins can manage all API endpoints"
  ON public.api_validation_endpoints
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Anyone can view active API endpoints"
  ON public.api_validation_endpoints
  FOR SELECT
  USING (is_active = true);

-- Create indexes for performance
CREATE INDEX idx_webhooks_is_active ON public.webhooks(is_active);
CREATE INDEX idx_webhooks_created_by ON public.webhooks(created_by);
CREATE INDEX idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created_at ON public.webhook_deliveries(created_at DESC);
CREATE INDEX idx_api_validation_endpoints_path ON public.api_validation_endpoints(path);
CREATE INDEX idx_api_validation_endpoints_is_active ON public.api_validation_endpoints(is_active);

-- Add triggers for updated_at
CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON public.webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_validation_endpoints_updated_at
  BEFORE UPDATE ON public.api_validation_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();