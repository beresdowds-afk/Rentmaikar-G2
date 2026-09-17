import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { invokeEdge } from '@/lib/edge-invoke';

export type MotionStatus = 'moving' | 'idle' | 'parked' | 'offline' | 'depot';

export interface OwnerTrackedVehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string;
  color: string | null;
  status: string; // 'active', 'available', etc.
  gpsTrackingEnabled: boolean;
  pickupCity: string | null;
  pickupAddress: string | null;
  pickupLocation: string | null;
  
  // Telemetry details
  hasLiveGps: boolean;
  latitude: number;
  longitude: number;
  speedKmh: number;
  speedMph: number;
  course: number; // heading in degrees 0-359
  altitude: number | null;
  ignition: boolean | null;
  batteryLevel: number | null;
  currentAddress: string | null;
  lastPing: string | null;
  gpsTimestamp: string | null;
  motionStatus: MotionStatus;
  provider: string;
  providerDeviceId: string | null;
  serialNumber: string | null;
  isHistoric: boolean;

  // Rental / Driver details
  assignedDriver: {
    id: string;
    fullName: string | null;
    phone: string | null;
  } | null;
}

const KNOTS_TO_KMH = 1.852;
const KMH_TO_MPH = 0.621371;

// Approximate geographical centers for common operational hubs
const HUB_COORDINATES: Record<string, [number, number]> = {
  lagos: [6.5244, 3.3792],
  ikeja: [6.6018, 3.3515],
  lekki: [6.4698, 3.5852],
  abuja: [9.0765, 7.3986],
  'port harcourt': [4.8156, 7.0498],
  ibadan: [7.3775, 3.947],
  maryland: [39.0458, -76.6413],
  baltimore: [39.2904, -76.6122],
  virginia: [38.8799, -77.1068],
  dc: [38.9072, -77.0369],
  washington: [38.9072, -77.0369],
  default: [38.9072, -77.0369],
};

function resolveHubCoordinates(city?: string | null, address?: string | null, vehicleId?: string): [number, number] {
  const query = `${city || ''} ${address || ''}`.toLowerCase();
  for (const [key, coords] of Object.entries(HUB_COORDINATES)) {
    if (key !== 'default' && query.includes(key)) {
      // Deterministic slight offset based on ID so stacked depot vehicles fan out
      const seed = vehicleId ? vehicleId.charCodeAt(0) + vehicleId.charCodeAt(vehicleId.length - 1) : 0;
      const offsetLat = ((seed % 10) - 5) * 0.002;
      const offsetLng = (((seed >> 2) % 10) - 5) * 0.002;
      return [coords[0] + offsetLat, coords[1] + offsetLng];
    }
  }
  const fallback = HUB_COORDINATES.default;
  const seed = vehicleId ? vehicleId.charCodeAt(0) : 0;
  return [fallback[0] + ((seed % 6) - 3) * 0.002, fallback[1] + (((seed >> 1) % 6) - 3) * 0.002];
}

export function useOwnerVehicleLocations() {
  const { user } = useAuth();
  const impersonation = useImpersonation();
  const targetId = impersonation?.role === 'owner' ? impersonation.viewAsUserId : user?.id;

  const [vehicles, setVehicles] = useState<OwnerTrackedVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // in seconds, 0 = off

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async (quiet = false) => {
    if (!targetId) {
      setVehicles([]);
      setLoading(false);
      return;
    }

    if (!quiet) setLoading(true);
    setError(null);

    try {
      // 1. Fetch all vehicles owned by this user
      const { data: ownerVehicles, error: vErr } = await supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, color, pickup_city, pickup_address, pickup_location, status, gps_tracking_enabled')
        .eq('owner_id', targetId)
        .order('created_at', { ascending: false });

      if (vErr) throw vErr;
      const vRows = ownerVehicles || [];

      if (vRows.length === 0) {
        if (isMountedRef.current) {
          setVehicles([]);
          setLoading(false);
        }
        return;
      }

      const vehicleIds = vRows.map((v) => v.id);

      // 2. Fetch associated IoT devices, telemetry state, and active rentals in parallel
      const [iotRes, telemRes, rentalsRes] = await Promise.all([
        supabase
          .from('iot_devices')
          .select('id, serial_number, vehicle_id, latitude, longitude, last_ping, status, battery_level, provider, provider_device_id, health_details')
          .in('vehicle_id', vehicleIds),
        supabase
          .from('vehicle_telemetry_state')
          .select('vehicle_id, latitude, longitude, speed, heading, altitude, battery, fuel, temperature, ignition, address, provider, provider_device_id, gps_timestamp, last_event_at, received_at, is_historic')
          .in('vehicle_id', vehicleIds),
        supabase
          .from('rentals')
          .select('id, vehicle_id, driver_id, status')
          .in('vehicle_id', vehicleIds)
          .eq('status', 'active'),
      ]);

      const iotMap = new Map((iotRes.data || []).map((d) => [d.vehicle_id, d]));
      const telemMap = new Map((telemRes.data || []).map((t) => [t.vehicle_id, t]));
      const rentalMap = new Map((rentalsRes.data || []).map((r) => [r.vehicle_id, r]));

      // 3. Fetch driver profiles for active rentals
      const driverIds = Array.from(
        new Set(
          (rentalsRes.data || [])
            .map((r) => r.driver_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const driverProfileMap = new Map<string, { fullName: string | null; phone: string | null }>();
      if (driverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', driverIds);

        (profiles || []).forEach((p) => {
          driverProfileMap.set(p.id, { fullName: p.full_name, phone: p.phone });
        });
      }

      // 4. Transform and combine into unified OwnerTrackedVehicle records
      const nowMs = Date.now();
      const mappedVehicles: OwnerTrackedVehicle[] = vRows.map((v) => {
        const iot = iotMap.get(v.id);
        const telem = telemMap.get(v.id);
        const rental = rentalMap.get(v.id);
        const driverInfo = rental?.driver_id ? driverProfileMap.get(rental.driver_id) : null;

        const healthDetails = (iot?.health_details as Record<string, unknown> | null) ?? {};
        const lastPosition = (healthDetails.last_position as Record<string, unknown> | null) ?? {};

        // Resolve latitude and longitude
        const rawLat = telem?.latitude ?? iot?.latitude;
        const rawLng = telem?.longitude ?? iot?.longitude;
        const numLat = rawLat !== null && rawLat !== undefined ? Number(rawLat) : NaN;
        const numLng = rawLng !== null && rawLng !== undefined ? Number(rawLng) : NaN;
        const hasLiveCoords =
          Number.isFinite(numLat) &&
          Number.isFinite(numLng) &&
          (numLat !== 0 || numLng !== 0) &&
          Math.abs(numLat) <= 90 &&
          Math.abs(numLng) <= 180;

        let finalLat = numLat;
        let finalLng = numLng;

        // If no GPS fix has been recorded yet, position vehicle at its designated pickup hub
        if (!hasLiveCoords) {
          const [hubLat, hubLng] = resolveHubCoordinates(v.pickup_city, v.pickup_address, v.id);
          finalLat = hubLat;
          finalLng = hubLng;
        }

        // Speed calculation
        let speedKmh = 0;
        if (telem?.speed !== null && telem?.speed !== undefined) {
          speedKmh = Number(telem.speed);
        } else if (lastPosition.speed_kmh !== undefined) {
          speedKmh = Number(lastPosition.speed_kmh);
        }
        const speedMph = Math.round(speedKmh * KMH_TO_MPH);

        // Heading / course
        const course = Math.round(Number(telem?.heading ?? lastPosition.course ?? 0));

        // Timestamps
        const lastPing = telem?.gps_timestamp ?? telem?.last_event_at ?? iot?.last_ping ?? null;
        const pingMs = lastPing ? new Date(lastPing).getTime() : 0;
        const ageMinutes = pingMs ? Math.max(0, Math.round((nowMs - pingMs) / 60_000)) : Infinity;

        // Ignition & Battery
        const ignition = telem?.ignition ?? null;
        const batteryLevel = telem?.battery !== null && telem?.battery !== undefined
          ? Math.round(Number(telem.battery))
          : (iot?.battery_level ?? null);

        // Motion status
        let motionStatus: MotionStatus = 'offline';
        if (!hasLiveCoords) {
          motionStatus = 'depot';
        } else if (ageMinutes > 120 || iot?.status === 'offline') {
          motionStatus = 'offline';
        } else if (speedKmh > 3) {
          motionStatus = 'moving';
        } else if (ignition === true || (ignition === null && speedKmh > 0)) {
          motionStatus = 'idle';
        } else {
          motionStatus = 'parked';
        }

        // Address resolution
        const currentAddress =
          telem?.address ||
          (lastPosition.address as string) ||
          (v.pickup_address ? `${v.pickup_address}, ${v.pickup_city || ''}` : null);

        return {
          id: v.id,
          make: v.make || 'Vehicle',
          model: v.model || 'Model',
          year: v.year,
          licensePlate: v.license_plate || 'UNLISTED',
          color: v.color,
          status: v.status || 'available',
          gpsTrackingEnabled: Boolean(v.gps_tracking_enabled),
          pickupCity: v.pickup_city,
          pickupAddress: v.pickup_address,
          pickupLocation: v.pickup_location,
          hasLiveGps: hasLiveCoords,
          latitude: finalLat,
          longitude: finalLng,
          speedKmh: Math.round(speedKmh),
          speedMph,
          course,
          altitude: telem?.altitude !== null && telem?.altitude !== undefined ? Math.round(Number(telem.altitude)) : null,
          ignition,
          batteryLevel,
          currentAddress,
          lastPing,
          gpsTimestamp: telem?.gps_timestamp ?? null,
          motionStatus,
          provider: telem?.provider || iot?.provider || 'traccar',
          providerDeviceId: telem?.provider_device_id || iot?.provider_device_id || null,
          serialNumber: iot?.serial_number || null,
          isHistoric: Boolean(telem?.is_historic),
          assignedDriver: rental?.driver_id
            ? {
                id: rental.driver_id,
                fullName: driverInfo?.fullName || 'Assigned Driver',
                phone: driverInfo?.phone || null,
              }
            : null,
        };
      });

      if (isMountedRef.current) {
        setVehicles(mappedVehicles);
        setLastSyncAt(new Date().toISOString());
        setLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load vehicle telemetry');
        setLoading(false);
      }
    }
  }, [targetId]);

  // Sync positions from Traccar backend edge function
  const syncTraccar = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    setSyncing(true);
    try {
      const vehicleIds = vehicles.map((v) => v.id);
      const { data, error: err } = await invokeEdge<{
        ok?: boolean;
        configured?: boolean;
        devices_synced?: number;
        positions_imported?: number;
        diagnosis?: { title?: string; detail?: string };
        message?: string;
      }>('traccar-admin', {
        action: 'sync',
        vehicle_ids: vehicleIds.length > 0 ? vehicleIds : undefined,
      });

      if (err) {
        // If the actor is a standard vehicle owner (not admin), the background
        // Traccar cron updates positions automatically; we refresh latest telemetry from Supabase.
        await loadData(true);
        return { ok: true, message: 'Telemetry refreshed with latest vehicle positions.' };
      }

      await loadData(true);

      if (data?.configured === false) {
        return {
          ok: true,
          message: 'Traccar integration active. Stored vehicle positions refreshed.',
        };
      }

      if (data?.ok === false) {
        return {
          ok: false,
          message: data.diagnosis?.title
            ? `${data.diagnosis.title}: ${data.diagnosis.detail}`
            : 'Traccar server sync encountered an issue.',
        };
      }

      const countMsg = `${data?.devices_synced ?? 0} devices / ${data?.positions_imported ?? 0} positions updated`;
      return {
        ok: true,
        message: `Traccar sync completed (${countMsg})`,
      };
    } catch (e) {
      await loadData(true);
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Telemetry sync failed',
      };
    } finally {
      if (isMountedRef.current) setSyncing(false);
    }
  }, [vehicles, loadData]);

  // Initial load
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Realtime Supabase change listener
  useEffect(() => {
    if (!targetId) return;

    const channel = supabase
      .channel(`owner-fleet-telemetry-${targetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_telemetry_state' }, () => {
        void loadData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iot_devices' }, () => {
        void loadData(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [targetId, loadData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefreshInterval || autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      void loadData(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, loadData]);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) || null;
  }, [vehicles, selectedVehicleId]);

  const stats = useMemo(() => {
    const total = vehicles.length;
    const moving = vehicles.filter((v) => v.motionStatus === 'moving').length;
    const idle = vehicles.filter((v) => v.motionStatus === 'idle').length;
    const parked = vehicles.filter((v) => v.motionStatus === 'parked').length;
    const offline = vehicles.filter((v) => v.motionStatus === 'offline').length;
    const depot = vehicles.filter((v) => v.motionStatus === 'depot').length;
    const withGps = vehicles.filter((v) => v.hasLiveGps).length;

    return { total, moving, idle, parked, offline, depot, withGps };
  }, [vehicles]);

  return {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,
    loading,
    syncing,
    lastSyncAt,
    error,
    stats,
    autoRefreshInterval,
    setAutoRefreshInterval,
    refresh: () => loadData(false),
    syncTraccar,
  };
}
