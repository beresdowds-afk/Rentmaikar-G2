-- ============================================================================
-- Migration: 20261001094000_support_tickets.sql
-- Tier 2 Feature 30: Unified Support Ticket Queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL, -- 'email', 'in_app', 'sms', 'system', 'sos'
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','assigned','in_progress','waiting_customer','waiting_internal','resolved','closed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  sla_due_at timestamptz,
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
  ON public.support_tickets(status, priority);

CREATE INDEX IF NOT EXISTS idx_support_tickets_requester
  ON public.support_tickets(requester_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned
  ON public.support_tickets(assigned_to);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view their own support tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'legal_support', 'iot_support', 'vehicle_support')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create support tickets" ON public.support_tickets;
CREATE POLICY "Authenticated users can create support tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant')
    )
  );

DROP POLICY IF EXISTS "Support staff can update support tickets" ON public.support_tickets;
CREATE POLICY "Support staff can update support tickets"
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'admin_assistant', 'legal_support', 'iot_support', 'vehicle_support')
    )
  );
