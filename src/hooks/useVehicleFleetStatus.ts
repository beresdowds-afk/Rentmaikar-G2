import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FleetVehicleStatus {
  vehicleId: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string | null;
  ownerId: string | null;
  provisioningStage: string | null;
  provisioningTest: string | null;
  deviceId: string | null;
  telemetry: {
    latitude: number | null;
    longitude: number | null;
    speed: number | null;
    ignition: boolean | null;
    battery: number | null;
    address: string | null;
    lastEventAt: string | null;
    provider: string | null;
  } | null;
  assignedDriverId: string | null;
  matchStatus: string | null;
  milesToday: number;
  milesThisMonth: number;
  milesTotal: number;
}

export interface MileageRow {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  log_date: string;
  miles: number;
  source: string;
  odometer_start: number | null;
  odometer_end: number | null;
}

interface Options {
  /** Restrict to vehicles owned by this user (owner portal). */
  ownerId?: string;
  /** Poll interval in ms for live telemetry. 0 disables polling. */
  pollMs?: number;
}

const monthKey = (d: string) => d.slice(0, 7);

/**
 * Fleet status for provisioned vehicles: provisioning stage, live telemetry
 * snapshot, assigned driver, and daily/monthly mileage rollups.
 * RLS scopes the data (owners see their own vehicles, admins see everything).
 */
export function useVehicleFleetStatus({ ownerId, pollMs = 30000 }: Options = {}) {
  const [vehicles, setVehicles] = useState<FleetVehicleStatus[]>([]);
  const [mileage, setMileage] = useState<MileageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      let vehicleQuery = supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, owner_id')
        .order('created_at', { ascending: false });
      if (ownerId) vehicleQuery = vehicleQuery.eq('owner_id', ownerId);

      const { data: vehicleRows, error: vErr } = await vehicleQuery;
      if (vErr) throw vErr;

      const ids = (vehicleRows ?? []).map((v) => v.id);
      if (ids.length === 0) {
        setVehicles([]);
        setMileage([]);
        return;
      }

      const [prov, telem, matches, miles] = await Promise.all([
        supabase
          .from('iot_provisioning_state')
          .select('vehicle_id, stage, test_status, device_id')
          .in('vehicle_id', ids),
        supabase
          .from('vehicle_telemetry_state')
          .select(
            'vehicle_id, latitude, longitude, speed, ignition, battery, address, last_event_at, provider',
          )
          .in('vehicle_id', ids),
        supabase
          .from('driver_vehicle_matches')
          .select('vehicle_id, driver_id, status')
          .in('vehicle_id', ids)
          .is('cancelled_at', null),
        supabase
          .from('vehicle_mileage_logs')
          .select('id, vehicle_id, driver_id, log_date, miles, source, odometer_start, odometer_end')
          .in('vehicle_id', ids)
          .order('log_date', { ascending: false })
          .limit(1000),
      ]);

      const provMap = new Map((prov.data ?? []).map((p) => [p.vehicle_id, p]));
      const telemMap = new Map((telem.data ?? []).map((t) => [String(t.vehicle_id), t]));
      const matchMap = new Map((matches.data ?? []).map((m) => [m.vehicle_id, m]));
      const mileRows = (miles.data ?? []) as MileageRow[];

      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = monthKey(today);

      setMileage(mileRows);
      setVehicles(
        (vehicleRows ?? []).map((v) => {
          const rows = mileRows.filter((m) => m.vehicle_id === v.id);
          const t = telemMap.get(v.id);
          const p = provMap.get(v.id);
          const m = matchMap.get(v.id);
          return {
            vehicleId: v.id,
            make: v.make,
            model: v.model,
            year: v.year ?? null,
            licensePlate: v.license_plate ?? null,
            ownerId: v.owner_id ?? null,
            provisioningStage: p?.stage ?? null,
            provisioningTest: p?.test_status ?? null,
            deviceId: p?.device_id ?? null,
            telemetry: t
              ? {
                  latitude: t.latitude === null ? null : Number(t.latitude),
                  longitude: t.longitude === null ? null : Number(t.longitude),
                  speed: t.speed === null ? null : Number(t.speed),
                  ignition: t.ignition ?? null,
                  battery: t.battery === null ? null : Number(t.battery),
                  address: t.address ?? null,
                  lastEventAt: t.last_event_at ?? null,
                  provider: t.provider ?? null,
                }
              : null,
            assignedDriverId: m?.driver_id ?? null,
            matchStatus: m?.status ?? null,
            milesToday: rows
              .filter((r) => r.log_date === today)
              .reduce((s, r) => s + Number(r.miles || 0), 0),
            milesThisMonth: rows
              .filter((r) => monthKey(r.log_date) === thisMonth)
              .reduce((s, r) => s + Number(r.miles || 0), 0),
            milesTotal: rows.reduce((s, r) => s + Number(r.miles || 0), 0),
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle status');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const id = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);

  const provisioned = useMemo(
    () => vehicles.filter((v) => v.provisioningStage === 'ready'),
    [vehicles],
  );

  return { vehicles, provisioned, mileage, loading, error, refresh: load };
}
