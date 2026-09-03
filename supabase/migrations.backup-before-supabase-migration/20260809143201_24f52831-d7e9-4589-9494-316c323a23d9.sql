CREATE TABLE public.device_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key text NOT NULL UNIQUE,
  bundle_level smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'incomplete',
  sim_id uuid REFERENCES public.iot_sim_cards(id) ON DELETE SET NULL,
  device_id uuid NOT NULL UNIQUE REFERENCES public.iot_devices(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  mqtt_credential_id uuid REFERENCES public.vehicle_mqtt_credentials(id) ON DELETE SET NULL,
  rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  driver_id uuid,
  owner_id uuid,
  iccid text,
  provider_sim_id text,
  sim_provider text,
  imei text,
  serial_number text,
  license_plate text,
  vin text,
  mqtt_client_id text,
  mqtt_username text,
  topic_prefix text,
  telemetry_provider text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_identities TO authenticated;
GRANT ALL ON public.device_identities TO service_role;

ALTER TABLE public.device_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage device identities"
ON public.device_identities FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support'));

CREATE POLICY "Owner and driver read own device identity"
ON public.device_identities FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR auth.uid() = driver_id);

CREATE INDEX idx_device_identities_vehicle ON public.device_identities(vehicle_id);
CREATE INDEX idx_device_identities_driver ON public.device_identities(driver_id);
CREATE INDEX idx_device_identities_sim ON public.device_identities(sim_id);

CREATE TRIGGER trg_device_identities_updated_at
BEFORE UPDATE ON public.device_identities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

  IF s.id IS NOT NULL THEN lvl := 2; END IF;
  IF lvl = 2 AND v.id IS NOT NULL THEN lvl := 3; END IF;
  IF lvl = 3 AND c.id IS NOT NULL THEN lvl := 4; END IF;
  IF lvl = 4 AND r.driver_id IS NOT NULL THEN lvl := 5; END IF;

  st := CASE lvl
          WHEN 5 THEN 'fully_bundled'
          WHEN 4 THEN 'broker_ready'
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
    d.provider, now()
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

CREATE OR REPLACE FUNCTION public.trg_sync_device_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec jsonb; dev uuid;
BEGIN
  rec := to_jsonb(COALESCE(NEW, OLD));

  IF TG_TABLE_NAME = 'iot_devices' THEN
    PERFORM public.sync_device_identity((rec->>'id')::uuid);
  ELSIF TG_TABLE_NAME = 'iot_sim_cards' THEN
    IF rec->>'device_id' IS NOT NULL THEN
      PERFORM public.sync_device_identity((rec->>'device_id')::uuid);
    END IF;
  ELSIF TG_TABLE_NAME = 'vehicle_mqtt_credentials' THEN
    FOR dev IN SELECT id FROM public.iot_devices WHERE vehicle_id = (rec->>'vehicle_id')::uuid LOOP
      PERFORM public.sync_device_identity(dev);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'rentals' THEN
    FOR dev IN SELECT id FROM public.iot_devices WHERE vehicle_id = (rec->>'vehicle_id')::uuid LOOP
      PERFORM public.sync_device_identity(dev);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.trg_sync_device_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_device_identity_from_device
AFTER INSERT OR UPDATE OF vehicle_id, imei, serial_number, sim_number, sim_provider, provider, status
ON public.iot_devices FOR EACH ROW EXECUTE FUNCTION public.trg_sync_device_identity();

CREATE TRIGGER trg_device_identity_from_sim
AFTER INSERT OR UPDATE OF device_id, vehicle_id, iccid, provider_sim_id, status
ON public.iot_sim_cards FOR EACH ROW EXECUTE FUNCTION public.trg_sync_device_identity();

CREATE TRIGGER trg_device_identity_from_mqtt
AFTER INSERT OR UPDATE OF vehicle_id, iot_device_id, client_id, mqtt_username, is_active
ON public.vehicle_mqtt_credentials FOR EACH ROW EXECUTE FUNCTION public.trg_sync_device_identity();

CREATE TRIGGER trg_device_identity_from_rental
AFTER INSERT OR UPDATE OF driver_id, status, vehicle_id
ON public.rentals FOR EACH ROW EXECUTE FUNCTION public.trg_sync_device_identity();

CREATE OR REPLACE FUNCTION public.rebuild_all_device_identities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0; dev uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'iot_support')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR dev IN SELECT id FROM public.iot_devices LOOP
    PERFORM public.sync_device_identity(dev);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_all_device_identities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_all_device_identities() TO authenticated, service_role;