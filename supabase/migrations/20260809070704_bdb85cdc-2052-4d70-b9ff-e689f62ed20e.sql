-- 1. Insurance task status enum
DO $$ BEGIN
  CREATE TYPE public.insurance_task_status AS ENUM ('open','reviewing','awaiting_documents','quote_sent','escalated','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. New columns on support_tasks
ALTER TABLE public.support_tasks
  ADD COLUMN IF NOT EXISTS insurance_status public.insurance_task_status DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS staff_feedback text,
  ADD COLUMN IF NOT EXISTS staff_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_resolved_by uuid,
  ADD COLUMN IF NOT EXISTS verification_state text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verification_notes text;

-- 3. Auto-resolve on staff feedback
CREATE OR REPLACE FUNCTION public.support_feedback_marks_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.support_tasks%ROWTYPE;
  _is_assigned boolean;
BEGIN
  IF NEW.update_type <> 'feedback' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _task FROM public.support_tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.support_staff s
    WHERE s.user_id = NEW.user_id
      AND s.is_active = true
      AND (_task.assigned_to = s.id OR _task.assigned_to IS NULL)
  ) INTO _is_assigned;

  IF NOT _is_assigned THEN
    RETURN NEW;
  END IF;

  UPDATE public.support_tasks
  SET staff_feedback = NEW.content,
      staff_resolved_at = now(),
      staff_resolved_by = NEW.user_id,
      verification_state = 'pending_verification',
      resolution_notes = COALESCE(resolution_notes, NEW.content),
      legal_status = CASE WHEN task_type = 'legal' THEN 'resolved'::legal_task_status ELSE legal_status END,
      iot_status = CASE WHEN task_type IN ('iot_installation','iot_maintenance') THEN 'completed'::iot_task_status ELSE iot_status END,
      vehicle_status = CASE WHEN task_type IN ('vehicle_recall','vehicle_maintenance') THEN 'completed'::vehicle_task_status ELSE vehicle_status END,
      insurance_status = CASE WHEN task_type = 'insurance' THEN 'resolved'::insurance_task_status ELSE insurance_status END,
      updated_at = now()
  WHERE id = NEW.task_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.support_feedback_marks_resolved() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_support_feedback_marks_resolved ON public.support_task_updates;
CREATE TRIGGER trg_support_feedback_marks_resolved
AFTER INSERT ON public.support_task_updates
FOR EACH ROW EXECUTE FUNCTION public.support_feedback_marks_resolved();

-- 4. Admin verification RPC
CREATE OR REPLACE FUNCTION public.admin_verify_support_task(
  _task_id uuid,
  _approve boolean,
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.has_admin_privilege(auth.uid(), 'can_manage_support_tasks')) THEN
    RAISE EXCEPTION 'Not authorized to verify support tasks';
  END IF;

  UPDATE public.support_tasks
  SET verification_state = CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
      verified_at = now(),
      verified_by = auth.uid(),
      verification_notes = _notes,
      resolved_at = CASE WHEN _approve THEN COALESCE(resolved_at, now()) ELSE NULL END,
      resolved_by = CASE WHEN _approve THEN COALESCE(resolved_by, staff_resolved_by) ELSE NULL END,
      updated_at = now()
  WHERE id = _task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  INSERT INTO public.support_task_updates (task_id, user_id, update_type, new_status, content)
  VALUES (
    _task_id,
    auth.uid(),
    CASE WHEN _approve THEN 'resolution' ELSE 'note' END,
    CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
    COALESCE(_notes, CASE WHEN _approve THEN 'Task verified and approved by admin' ELSE 'Task sent back for rework by admin' END)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_verify_support_task(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_support_task(uuid, boolean, text) TO authenticated;

-- 5. Extend support staff visibility to insurance tasks
DROP POLICY IF EXISTS "Support staff can view tasks in their city" ON public.support_tasks;
CREATE POLICY "Support staff can view tasks in their city"
ON public.support_tasks
FOR SELECT
TO authenticated
USING (
  city = public.get_support_staff_city(auth.uid(), task_type)
);
