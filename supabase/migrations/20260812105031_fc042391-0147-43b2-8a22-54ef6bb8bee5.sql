CREATE TABLE public.vehicle_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  owner_id uuid,
  actor_id uuid,
  action text NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_audit_log TO authenticated;
GRANT ALL ON public.vehicle_audit_log TO service_role;

ALTER TABLE public.vehicle_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vehicle_audit_log_vehicle ON public.vehicle_audit_log(vehicle_id, created_at DESC);
CREATE INDEX idx_vehicle_audit_log_owner ON public.vehicle_audit_log(owner_id, created_at DESC);

CREATE POLICY "Owners can view their vehicle history"
ON public.vehicle_audit_log FOR SELECT TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all vehicle history"
ON public.vehicle_audit_log FOR SELECT TO authenticated
USING (public.is_admin() OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles'));

CREATE OR REPLACE FUNCTION public.log_vehicle_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tracked text[] := ARRAY[
    'make','model','year','license_plate','color','vin','status','is_public',
    'pickup_city','pickup_address','pickup_instructions','photo_urls',
    'review_status','review_notes','daily_rate','weekly_rate','category'
  ];
  col text;
  oldv jsonb;
  newv jsonb := to_jsonb(NEW);
  changed text[] := '{}';
  old_diff jsonb := '{}'::jsonb;
  new_diff jsonb := '{}'::jsonb;
  act text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.vehicle_audit_log(vehicle_id, owner_id, actor_id, action, changed_fields, new_values)
    VALUES (NEW.id, NEW.owner_id, auth.uid(), 'created', ARRAY['*'],
            jsonb_build_object('make', newv->'make', 'model', newv->'model', 'status', newv->'status'));
    RETURN NEW;
  END IF;

  oldv := to_jsonb(OLD);

  FOREACH col IN ARRAY tracked LOOP
    IF (oldv ? col OR newv ? col) AND (oldv->col) IS DISTINCT FROM (newv->col) THEN
      changed := changed || col;
      old_diff := old_diff || jsonb_build_object(col, oldv->col);
      new_diff := new_diff || jsonb_build_object(col, newv->col);
    END IF;
  END LOOP;

  IF array_length(changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  act := 'updated';
  IF 'review_status' = ANY(changed) THEN
    act := CASE newv->>'review_status'
      WHEN 'published' THEN 'published'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'review_updated'
    END;
  ELSIF 'is_public' = ANY(changed) THEN
    act := CASE WHEN (newv->>'is_public')::boolean THEN 'made_public' ELSE 'hidden' END;
  END IF;

  INSERT INTO public.vehicle_audit_log(vehicle_id, owner_id, actor_id, action, changed_fields, old_values, new_values, review_notes)
  VALUES (NEW.id, NEW.owner_id, auth.uid(), act, changed, old_diff, new_diff, newv->>'review_notes');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_vehicle_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_vehicle_changes ON public.vehicles;
CREATE TRIGGER trg_log_vehicle_changes
AFTER INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.log_vehicle_changes();