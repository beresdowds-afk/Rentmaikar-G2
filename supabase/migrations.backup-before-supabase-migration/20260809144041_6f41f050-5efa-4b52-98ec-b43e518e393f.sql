CREATE OR REPLACE FUNCTION public.sync_device_identity(_device_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record; s record; v record; c record; r record;
  lvl smallint := 1;
  st text := 'incomplete';
  key text;
  out_id uuid;
  active_provider text;
  tracking_linked boolean := false;
  linked_provider text;
BEGIN
  SELECT * INTO d FROM public.iot_devices WHERE id = _device_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO s FROM public.iot_sim_cards
   WHERE device_id = d.id OR (d.sim_number IS NOT NULL AND iccid = d.sim_number)
   ORDER BY updated_at DESC LIMIT 1;

  IF d.vehicle_id IS NOT NULL THEN
    SELECT * INTO v FROM public.vehicles WHERE id = d.vehicle_id;
    SELECT * INTO c FROM public.vehicle_mqtt_credentials
     WHERE vehicle_id = d.vehicle_id AND (iot_device_id = d.id OR iot_device_id IS NULL)
     ORDER BY is_active DESC, updated_at DESC LIMIT 1;
    SELECT * INTO r FROM public.rentals
     WHERE vehicle_id = d.vehicle_id AND status IN ('active','ongoing','in_progress')
     ORDER BY start_date DESC LIMIT 1;
  END IF;

  SELECT name INTO active_provider FROM public.telemetry_providers
   WHERE is_active = true ORDER BY priority ASC NULLS LAST LIMIT 1;

  -- Tracking service linkage: EMQX broker credentials, or Traccar / vehicle-tracking
  -- alternative evidenced by an ingested telemetry state or telemetry-enabled device.
  IF c.id IS NOT NULL AND COALESCE(c.client_id,'') <> '' THEN
    tracking_linked := true;
    linked_provider := 'emqx';
  ELSIF d.vehicle_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vehicle_telemetry_state ts WHERE ts.vehicle_id = d.vehicle_id
    ) THEN
    tracking_linked := true;
    linked_provider := COALESCE(NULLIF(active_provider,''), 'traccar');
  ELSIF COALESCE(d.telemetry_enabled,false) AND COALESCE(active_provider,'') = 'traccar' THEN
    tracking_linked := true;
    linked_provider := 'traccar';
  END IF;

  -- ((((SIM + tracker) + vehicle) + driver) + EMQX/Traccar)
  IF s.id IS NOT NULL THEN lvl := 2; END IF;
  IF lvl = 2 AND v.id IS NOT NULL THEN lvl := 3; END IF;
  IF lvl = 3 AND r.driver_id IS NOT NULL THEN lvl := 4; END IF;
  IF lvl = 4 AND tracking_linked THEN lvl := 5; END IF;

  st := CASE lvl
          WHEN 5 THEN 'fully_bundled'
          WHEN 4 THEN 'driver_assigned'
          WHEN 3 THEN 'vehicle_assigned'
          WHEN 2 THEN 'sim_paired'
          ELSE 'incomplete' END;

  key := 'DID-' || upper(substr(replace(d.id::text,'-',''),1,8))
         || '-' || COALESCE(NULLIF(d.imei,''), NULLIF(d.serial_number,''), 'NOIMEI');

  INSERT INTO public.device_identities AS di (
    identity_key, bundle_level, status, sim_id, device_id, vehicle_id,
    mqtt_credential_id, rental_id, driver_id, owner_id,
    iccid, provider_sim_id, sim_provider, imei, serial_number,
    license_plate, vin, mqtt_client_id, mqtt_username, topic_prefix,
    telemetry_provider, last_synced_at
  ) VALUES (
    key, lvl, st, s.id, d.id, d.vehicle_id,
    c.id, r.id, r.driver_id, COALESCE(v.owner_id, r.owner_id),
    s.iccid, s.provider_sim_id, COALESCE(s.provider, d.sim_provider), d.imei, d.serial_number,
    v.license_plate, v.vin, c.client_id, c.mqtt_username, c.topic_prefix,
    COALESCE(linked_provider, NULLIF(active_provider,''), d.provider), now()
  )
  ON CONFLICT (device_id) DO UPDATE SET
    identity_key = EXCLUDED.identity_key,
    bundle_level = EXCLUDED.bundle_level,
    status = EXCLUDED.status,
    sim_id = EXCLUDED.sim_id,
    vehicle_id = EXCLUDED.vehicle_id,
    mqtt_credential_id = EXCLUDED.mqtt_credential_id,
    rental_id = EXCLUDED.rental_id,
    driver_id = EXCLUDED.driver_id,
    owner_id = EXCLUDED.owner_id,
    iccid = EXCLUDED.iccid,
    provider_sim_id = EXCLUDED.provider_sim_id,
    sim_provider = EXCLUDED.sim_provider,
    imei = EXCLUDED.imei,
    serial_number = EXCLUDED.serial_number,
    license_plate = EXCLUDED.license_plate,
    vin = EXCLUDED.vin,
    mqtt_client_id = EXCLUDED.mqtt_client_id,
    mqtt_username = EXCLUDED.mqtt_username,
    topic_prefix = EXCLUDED.topic_prefix,
    telemetry_provider = EXCLUDED.telemetry_provider,
    last_synced_at = now(),
    updated_at = now()
  RETURNING di.id INTO out_id;

  RETURN out_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_device_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_device_identity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_sync_device_identity_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE dev uuid;
BEGIN
  FOR dev IN SELECT id FROM public.iot_devices WHERE vehicle_id = NEW.vehicle_id LOOP
    PERFORM public.sync_device_identity(dev);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_sync_device_identity_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_device_identity_from_telemetry ON public.vehicle_telemetry_state;
CREATE TRIGGER trg_device_identity_from_telemetry
AFTER INSERT ON public.vehicle_telemetry_state
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_device_identity_state();

DO $$
DECLARE dev uuid;
BEGIN
  FOR dev IN SELECT id FROM public.iot_devices LOOP
    PERFORM public.sync_device_identity(dev);
  END LOOP;
END $$;