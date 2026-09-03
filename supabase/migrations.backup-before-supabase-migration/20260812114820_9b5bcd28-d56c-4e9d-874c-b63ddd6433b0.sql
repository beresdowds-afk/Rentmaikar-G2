CREATE TABLE IF NOT EXISTS public.vehicle_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'cron',
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  scanned_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_import_runs TO authenticated;
GRANT ALL ON public.vehicle_import_runs TO service_role;
ALTER TABLE public.vehicle_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vehicle import runs"
  ON public.vehicle_import_runs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles'));

CREATE TABLE IF NOT EXISTS public.vehicle_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.vehicle_import_runs(id) ON DELETE SET NULL,
  application_id uuid NOT NULL,
  owner_id uuid,
  license_plate text,
  normalized_plate text,
  make text,
  model text,
  year integer,
  color text,
  outcome text NOT NULL,
  skip_reason text,
  vehicle_id uuid,
  existing_vehicle_id uuid,
  resolution text NOT NULL DEFAULT 'unresolved',
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_import_items_application_key
  ON public.vehicle_import_items (application_id);
CREATE INDEX IF NOT EXISTS vehicle_import_items_outcome_idx
  ON public.vehicle_import_items (outcome, resolution, created_at DESC);

GRANT SELECT ON public.vehicle_import_items TO authenticated;
GRANT ALL ON public.vehicle_import_items TO service_role;
ALTER TABLE public.vehicle_import_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vehicle import items"
  ON public.vehicle_import_items FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles'));

CREATE TRIGGER trg_vehicle_import_items_updated_at
  BEFORE UPDATE ON public.vehicle_import_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_approved_application_vehicles(p_source text DEFAULT 'cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_scanned int := 0;
  v_imported int := 0;
  v_skipped int := 0;
  v_errors int := 0;
  r record;
  v_plate text;
  v_existing uuid;
  v_new_id uuid;
  v_outcome text;
  v_reason text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles')) THEN
    RAISE EXCEPTION 'Not authorized to run vehicle imports';
  END IF;

  INSERT INTO public.vehicle_import_runs (source, triggered_by)
  VALUES (COALESCE(NULLIF(p_source, ''), 'cron'), auth.uid())
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT a.id, a.user_id, a.vehicle_make, a.vehicle_model, a.vehicle_year,
           a.vehicle_color, a.vehicle_plate, a.city
    FROM public.applications a
    WHERE a.application_type = 'owner'
      AND a.status = 'approved'
      AND a.user_id IS NOT NULL
      AND COALESCE(btrim(a.vehicle_plate), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.vehicle_import_items i
        WHERE i.application_id = a.id AND i.outcome = 'imported'
      )
    ORDER BY a.created_at ASC
  LOOP
    v_scanned := v_scanned + 1;
    v_plate := upper(regexp_replace(r.vehicle_plate, '[^A-Za-z0-9]', '', 'g'));
    v_existing := NULL;
    v_new_id := NULL;
    v_outcome := NULL;
    v_reason := NULL;

    BEGIN
      SELECT v.id INTO v_existing
      FROM public.vehicles v
      WHERE upper(regexp_replace(v.license_plate, '[^A-Za-z0-9]', '', 'g')) = v_plate
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        v_outcome := 'skipped_duplicate';
        v_reason := 'A vehicle with this plate number already exists in the registry.';
      ELSIF COALESCE(btrim(r.vehicle_make), '') = ''
            OR COALESCE(btrim(r.vehicle_model), '') = ''
            OR r.vehicle_year IS NULL THEN
        v_outcome := 'skipped_incomplete';
        v_reason := 'Application is missing make, model or year.';
      ELSE
        INSERT INTO public.vehicles (
          owner_id, make, model, year, license_plate, color,
          pickup_city, photo_urls, status, is_public, review_status, submitted_at
        ) VALUES (
          r.user_id, btrim(r.vehicle_make), btrim(r.vehicle_model), r.vehicle_year,
          upper(btrim(r.vehicle_plate)), NULLIF(btrim(COALESCE(r.vehicle_color, '')), ''),
          NULLIF(btrim(COALESCE(r.city, '')), ''), ARRAY[]::text[], 'pending', false, 'pending', now()
        )
        RETURNING id INTO v_new_id;
        v_outcome := 'imported';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_outcome := 'error';
      v_reason := SQLERRM;
    END;

    INSERT INTO public.vehicle_import_items (
      run_id, application_id, owner_id, license_plate, normalized_plate,
      make, model, year, color, outcome, skip_reason, vehicle_id, existing_vehicle_id
    ) VALUES (
      v_run_id, r.id, r.user_id, btrim(r.vehicle_plate), v_plate,
      r.vehicle_make, r.vehicle_model, r.vehicle_year, r.vehicle_color,
      v_outcome, v_reason, v_new_id, v_existing
    )
    ON CONFLICT (application_id) DO UPDATE SET
      run_id = EXCLUDED.run_id,
      outcome = EXCLUDED.outcome,
      skip_reason = EXCLUDED.skip_reason,
      vehicle_id = COALESCE(EXCLUDED.vehicle_id, public.vehicle_import_items.vehicle_id),
      existing_vehicle_id = EXCLUDED.existing_vehicle_id,
      license_plate = EXCLUDED.license_plate,
      normalized_plate = EXCLUDED.normalized_plate,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year,
      color = EXCLUDED.color,
      updated_at = now()
    WHERE public.vehicle_import_items.resolution = 'unresolved';

    IF v_outcome = 'imported' THEN
      v_imported := v_imported + 1;
    ELSIF v_outcome = 'error' THEN
      v_errors := v_errors + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  UPDATE public.vehicle_import_runs
  SET finished_at = now(),
      scanned_count = v_scanned,
      imported_count = v_imported,
      skipped_count = v_skipped,
      error_count = v_errors
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'scanned', v_scanned, 'imported', v_imported,
    'skipped', v_skipped, 'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_approved_application_vehicles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_approved_application_vehicles(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_vehicle_import_duplicate(
  p_item_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.vehicle_import_items%ROWTYPE;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.has_admin_privilege(auth.uid(), 'can_manage_vehicles')) THEN
    RAISE EXCEPTION 'Not authorized to resolve vehicle import duplicates';
  END IF;

  SELECT * INTO it FROM public.vehicle_import_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import item not found';
  END IF;
  IF it.outcome <> 'skipped_duplicate' OR it.existing_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Only skipped duplicate entries can be resolved';
  END IF;
  IF p_action NOT IN ('keep_existing', 'merge', 'merge_and_transfer') THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  IF p_action IN ('merge', 'merge_and_transfer') THEN
    UPDATE public.vehicles v
    SET make = COALESCE(NULLIF(btrim(v.make), ''), btrim(it.make)),
        model = COALESCE(NULLIF(btrim(v.model), ''), btrim(it.model)),
        year = COALESCE(v.year, it.year),
        color = COALESCE(NULLIF(btrim(COALESCE(v.color, '')), ''), NULLIF(btrim(COALESCE(it.color, '')), '')),
        owner_id = CASE WHEN p_action = 'merge_and_transfer' AND it.owner_id IS NOT NULL
                        THEN it.owner_id ELSE v.owner_id END,
        updated_at = now()
    WHERE v.id = it.existing_vehicle_id;
  END IF;

  UPDATE public.vehicle_import_items
  SET resolution = CASE p_action
        WHEN 'keep_existing' THEN 'kept_existing'
        WHEN 'merge' THEN 'merged'
        ELSE 'merged_and_transferred' END,
      resolution_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      resolved_by = auth.uid(),
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('item_id', p_item_id, 'action', p_action, 'vehicle_id', it.existing_vehicle_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_vehicle_import_duplicate(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_vehicle_import_duplicate(uuid, text, text) TO authenticated, service_role;