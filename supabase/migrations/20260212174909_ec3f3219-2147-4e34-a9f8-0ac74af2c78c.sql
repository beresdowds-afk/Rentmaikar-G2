
-- Daily admin to-do list table
CREATE TABLE public.admin_daily_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL, -- 'applications', 'payment_defaults', 'expiring_documents', 'pending_negotiations', 'support_tasks', 'inbox', 'incidents', 'recalls', 'custom'
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  source_id TEXT, -- reference ID of the source record
  source_table TEXT, -- which table the task references
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast date lookups
CREATE INDEX idx_admin_daily_tasks_date ON public.admin_daily_tasks(task_date DESC);
CREATE INDEX idx_admin_daily_tasks_category ON public.admin_daily_tasks(category);

-- Enable RLS
ALTER TABLE public.admin_daily_tasks ENABLE ROW LEVEL SECURITY;

-- Only admins can manage daily tasks
CREATE POLICY "Admins can manage all daily tasks"
ON public.admin_daily_tasks
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_admin_daily_tasks_updated_at
BEFORE UPDATE ON public.admin_daily_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
