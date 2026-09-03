-- Add new support roles to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'legal_support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'iot_support';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vehicle_support';

-- Create enum for support task types
CREATE TYPE public.support_task_type AS ENUM ('legal', 'iot_installation', 'iot_maintenance', 'vehicle_recall', 'vehicle_maintenance');

-- Create enum for legal task statuses
CREATE TYPE public.legal_task_status AS ENUM ('open', 'document_review', 'pending_signature', 'escalated', 'resolved', 'closed');

-- Create enum for IoT task statuses
CREATE TYPE public.iot_task_status AS ENUM ('assigned', 'scheduled', 'in_transit', 'on_site', 'installation_complete', 'testing', 'completed', 'failed');

-- Create enum for vehicle support task statuses
CREATE TYPE public.vehicle_task_status AS ENUM ('reported', 'dispatched', 'inspection', 'repair_in_progress', 'pending_parts', 'quality_check', 'completed', 'escalated');

-- Create support staff profiles table with city assignment
CREATE TABLE public.support_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  support_type support_task_type NOT NULL,
  assigned_city TEXT NOT NULL,
  assigned_region TEXT NOT NULL DEFAULT 'Nigeria',
  is_active BOOLEAN NOT NULL DEFAULT true,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, support_type)
);

-- Create support tasks table
CREATE TABLE public.support_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type support_task_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Status fields (one per type, nullable)
  legal_status legal_task_status,
  iot_status iot_task_status,
  vehicle_status vehicle_task_status,
  
  -- Assignment
  assigned_to UUID REFERENCES public.support_staff(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  city TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'Nigeria',
  
  -- Related entities (nullable based on task type)
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID,
  owner_id UUID,
  device_id UUID REFERENCES public.iot_devices(id),
  recall_id UUID REFERENCES public.vehicle_recalls(id),
  agreement_id UUID REFERENCES public.legal_agreements(id),
  
  -- Location details
  location_address TEXT,
  location_lat NUMERIC,
  location_lng NUMERIC,
  
  -- Scheduling
  scheduled_date DATE,
  scheduled_time TIME,
  estimated_duration_hours INTEGER,
  
  -- Resolution
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create task feedback/updates table
CREATE TABLE public.support_task_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.support_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  update_type TEXT NOT NULL CHECK (update_type IN ('status_change', 'note', 'feedback', 'escalation', 'resolution')),
  previous_status TEXT,
  new_status TEXT,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_task_updates ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is support staff of a specific type
CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id UUID, _type support_task_type)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_staff
    WHERE user_id = _user_id
      AND support_type = _type
      AND is_active = true
  )
$$;

-- Helper function to get support staff city
CREATE OR REPLACE FUNCTION public.get_support_staff_city(_user_id UUID, _type support_task_type)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_city
  FROM public.support_staff
  WHERE user_id = _user_id
    AND support_type = _type
    AND is_active = true
  LIMIT 1
$$;

-- Helper function to check any support role
CREATE OR REPLACE FUNCTION public.is_any_support_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_staff
    WHERE user_id = _user_id
      AND is_active = true
  )
$$;

-- RLS Policies for support_staff
CREATE POLICY "Admins can manage all support staff"
ON public.support_staff FOR ALL
USING (is_admin());

CREATE POLICY "Support staff can view own profile"
ON public.support_staff FOR SELECT
USING (user_id = auth.uid());

-- RLS Policies for support_tasks
CREATE POLICY "Admins can manage all tasks"
ON public.support_tasks FOR ALL
USING (is_admin());

CREATE POLICY "Support staff can view tasks in their city"
ON public.support_tasks FOR SELECT
USING (
  (task_type = 'legal' AND city = get_support_staff_city(auth.uid(), 'legal')) OR
  (task_type IN ('iot_installation', 'iot_maintenance') AND city = get_support_staff_city(auth.uid(), task_type)) OR
  (task_type IN ('vehicle_recall', 'vehicle_maintenance') AND city = get_support_staff_city(auth.uid(), task_type))
);

CREATE POLICY "Support staff can update assigned tasks"
ON public.support_tasks FOR UPDATE
USING (
  assigned_to IN (SELECT id FROM public.support_staff WHERE user_id = auth.uid() AND is_active = true)
);

-- RLS Policies for support_task_updates
CREATE POLICY "Admins can manage all updates"
ON public.support_task_updates FOR ALL
USING (is_admin());

CREATE POLICY "Users can create updates for accessible tasks"
ON public.support_task_updates FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.support_tasks t
    WHERE t.id = task_id AND (
      is_admin() OR
      t.assigned_to IN (SELECT id FROM public.support_staff WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Users can view updates for accessible tasks"
ON public.support_task_updates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tasks t
    WHERE t.id = task_id AND (
      is_admin() OR
      t.assigned_to IN (SELECT id FROM public.support_staff WHERE user_id = auth.uid())
    )
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_support_staff_updated_at
BEFORE UPDATE ON public.support_staff
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tasks_updated_at
BEFORE UPDATE ON public.support_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();