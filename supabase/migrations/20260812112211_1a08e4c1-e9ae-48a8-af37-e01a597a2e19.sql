-- 1. Bulk job reference on the vehicle history log
ALTER TABLE public.vehicle_audit_log
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_vehicle_audit_log_batch ON public.vehicle_audit_log(batch_id) WHERE batch_id IS NOT NULL;

-- 2. Tag audit rows written during a bulk job
CREATE OR REPLACE FUNCTION public.log_vehicle_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_batch uuid := NULLIF(current_setting('app.review_batch_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.vehicle_audit_log(vehicle_id, owner_id, actor_id, action, changed_fields, new_values, batch_id)
    VALUES (NEW.id, NEW.owner_id, auth.uid(), 'created', ARRAY['*'],
            jsonb_build_object('make', newv->'make', 'model', newv->'model', 'status', newv->'status'), v_batch);
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

  INSERT INTO public.vehicle_audit_log(vehicle_id, owner_id, actor_id, action, changed_fields, old_values, new_values, review_notes, batch_id)
  VALUES (NEW.id, NEW.owner_id, auth.uid(), act, changed, old_diff, new_diff, newv->>'review_notes', v_batch);

  RETURN NEW;
END;
$function$;

-- 3. Bulk review RPC: one transaction, one audit row per vehicle, all linked to the job
CREATE OR REPLACE FUNCTION public.admin_review_vehicles_bulk(
  _vehicle_ids uuid[],
  _decision text,
  _reasons jsonb DEFAULT '{}'::jsonb,
  _batch_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_reason text;
  v_ok int := 0;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (public.is_admin() OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles')) THEN
    RAISE EXCEPTION 'Not authorised to review vehicle submissions';
  END IF;
  IF _decision NOT IN ('published','rejected','pending','needs_info') THEN
    RAISE EXCEPTION 'Invalid decision: %', _decision;
  END IF;

  PERFORM set_config('app.review_batch_id', _batch_id::text, true);

  FOREACH v_id IN ARRAY COALESCE(_vehicle_ids, '{}'::uuid[]) LOOP
    v_reason := NULLIF(btrim(COALESCE(_reasons->>v_id::text, '')), '');
    BEGIN
      PERFORM public.admin_review_vehicle(v_id, _decision, v_reason);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failures := v_failures || jsonb_build_object('id', v_id, 'message', SQLERRM);
    END;
  END LOOP;

  PERFORM set_config('app.review_batch_id', '', true);

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'total', COALESCE(array_length(_vehicle_ids, 1), 0),
    'succeeded', v_ok,
    'failures', v_failures
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_review_vehicles_bulk(uuid[], text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_vehicles_bulk(uuid[], text, jsonb, uuid) TO authenticated;

-- 4. Backfill legacy owner-uploaded vehicles so they surface correctly everywhere
UPDATE public.vehicles
SET review_status = CASE
      WHEN is_public IS TRUE THEN 'published'
      ELSE 'pending'
    END,
    published_at = CASE WHEN is_public IS TRUE THEN COALESCE(published_at, created_at) ELSE published_at END,
    updated_at = now()
WHERE review_status IS NULL;

UPDATE public.vehicles
SET is_public = false, updated_at = now()
WHERE is_public IS NULL AND review_status IS DISTINCT FROM 'published';

UPDATE public.vehicles
SET is_public = true,
    published_at = COALESCE(published_at, reviewed_at, created_at),
    updated_at = now()
WHERE review_status = 'published' AND is_public IS DISTINCT FROM true;

UPDATE public.vehicles
SET status = 'available', updated_at = now()
WHERE review_status = 'published' AND status = 'pending';

UPDATE public.vehicles
SET status = 'pending', updated_at = now()
WHERE review_status IN ('rejected','needs_info') AND status = 'available';
