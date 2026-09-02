import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { VehicleLocation, mqttTracker, SafetyCheckResult } from '@/lib/mqtt-client';
import { regions, Region } from '@/lib/regions';
import VehicleMarker from './VehicleMarker';
import { useFleetDeviceLocations, minutesSince } from '@/hooks/useFleetDeviceLocations';
import OfflineAlertControls from './OfflineAlertControls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Wifi, WifiOff, Car, AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import { toast } from 'sonner';

// Component to handle map view changes
const MapController = ({ center, zoom }: { center: { lat: number; lng: number }; zoom: number }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom);
  }, [center, zoom, map]);
  
  return null;
};

// Extended vehicle type with additional info
type ExtendedVehicle = VehicleLocation & { 
  make: string; 
  model: string; 
  licensePlate: string; 
  driverName: string;
  daysOverdue?: number;
  serialNumber?: string;
  isStale?: boolean;
};

const KMH_TO_MPH = 0.621371;

// Auto-fit the viewport to the plotted devices on first load / after a sync.
const FitToDevices = ({ points }: { points: Array<[number, number]> }) => {
  const map = useMap();
  const signature = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(points as [number, number][], { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);
  return null;
};

const VehicleTrackingMap = () => {
  const [selectedRegion, setSelectedRegion] = useState<Region>(regions[0]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [thresholdMinutes, setThresholdMinutes] = useState(60);
  const [liveOverrides, setLiveOverrides] = useState<Record<string, Partial<VehicleLocation>>>({});

  const { devices, loading, syncing, error, lastLoadedAt, syncNow } = useFleetDeviceLocations();

  // Real device positions -> map markers. Each tracker plots at its latest
  // known fix; a device is "stale" when it has been silent past the threshold.
  const vehicles: ExtendedVehicle[] = useMemo(
    () =>
      devices.map((d) => {
        const silentFor = minutesSince(d.lastPing);
        const isStale = silentFor === null || silentFor > thresholdMinutes;
        const speedMph = d.speedKmh * KMH_TO_MPH;
        const base: ExtendedVehicle = {
          vehicleId: d.vehicleId ?? d.deviceRowId,
          latitude: d.latitude,
          longitude: d.longitude,
          speed: speedMph,
          heading: d.course,
          ignitionStatus: d.status === 'active' && !isStale,
          batteryLevel: d.batteryLevel ?? 0,
          timestamp: d.lastPing ? new Date(d.lastPing) : new Date(),
          isParked: speedMph < 2,
          make: d.make,
          model: d.model,
          licensePlate: d.licensePlate,
          // Provider is a label only — positions are already normalized upstream,
          // so the map never parses provider-specific payloads.
          driverName: [
            d.provider === 'traccar'
              ? 'Traccar'
              : d.provider === 'sarekon'
                ? 'GPSANDTRACK'
                : 'EMQX',
            d.serialNumber,
            isStale
              ? `last seen ${silentFor === null ? 'unknown' : `${silentFor}m ago`}`
              : 'LIVE',
          ].join(' · '),


          serialNumber: d.serialNumber,
          isStale,
        };
        return { ...base, ...(liveOverrides[base.vehicleId] ?? {}) };
      }),
    [devices, thresholdMinutes, liveOverrides],
  );

  const setVehicles = useCallback(
    (updater: (prev: ExtendedVehicle[]) => ExtendedVehicle[]) => {
      // Live MQTT frames and command results are applied as overrides on top
      // of the synced positions, so a later sync still wins on refresh.
      setLiveOverrides((prev) => {
        const current = vehiclesRef.current;
        const next = updater(current);
        const merged = { ...prev };
        next.forEach((v, i) => {
          const before = current[i];
          if (!before || before.vehicleId !== v.vehicleId) return;
          if (before !== v) {
            merged[v.vehicleId] = {
              ...(merged[v.vehicleId] ?? {}),
              latitude: v.latitude,
              longitude: v.longitude,
              speed: v.speed,
              heading: v.heading,
              ignitionStatus: v.ignitionStatus,
              isParked: v.isParked,
              timestamp: v.timestamp,
            };
          }
        });
        return merged;
      });
    },
    [],
  );

  const vehiclesRef = useRef<ExtendedVehicle[]>([]);
  vehiclesRef.current = vehicles;

  // Safety confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    vehicleId: string;
    vehicleName: string;
    safetyCheck: SafetyCheckResult | null;
  }>({ isOpen: false, vehicleId: '', vehicleName: '', safetyCheck: null });


  // Positions are authoritative from the sync; drop stale overrides on reload.
  useEffect(() => { setLiveOverrides({}); }, [lastLoadedAt]);

  const connectMQTT = useCallback(async () => {
    setIsConnecting(true);
    try {
      await mqttTracker.connect();
      setIsConnected(true);
      toast.success('Connected to vehicle tracking system');

      // Subscribe to all vehicle updates
      mqttTracker.subscribeToAllVehicles((location) => {
        setVehicles(prev => {
          const index = prev.findIndex(v => v.vehicleId === location.vehicleId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = { ...updated[index], ...location };
            return updated;
          }
          return prev;
        });
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      toast.error('Failed to connect to tracking system');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectMQTT = useCallback(() => {
    mqttTracker.disconnect();
    setIsConnected(false);
    toast.info('Disconnected from tracking system');
  }, []);

  const handleDisableVehicle = async (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.vehicleId === vehicleId);
    if (!vehicle) return;

    // Check if this is after 3rd notification (3+ days overdue)
    const isAfterThirdNotification = (vehicle.daysOverdue || 0) >= 3;

    // Update local tracker with current vehicle state
    mqttTracker.updateVehicleLocation(vehicleId, vehicle);

    // Attempt disable with safety checks
    const result = await mqttTracker.sendCommand(vehicleId, 'disable', {
      isAfterThirdNotification,
      adminConfirmed: false,
    });

    if (result.success) {
      // Command succeeded, update UI
      setVehicles(prev => prev.map(v => 
        v.vehicleId === vehicleId ? { ...v, ignitionStatus: false } : v
      ));
      toast.success(result.message);
    } else if (result.safetyCheck?.requiresConfirmation) {
      // Show confirmation dialog
      setConfirmationDialog({
        isOpen: true,
        vehicleId,
        vehicleName: `${vehicle.make} ${vehicle.model}`,
        safetyCheck: result.safetyCheck,
      });
    } else {
      // Safety check failed completely
      toast.error(result.message, {
        duration: 5000,
        icon: <ShieldAlert className="w-5 h-5" />,
      });
    }
  };

  const handleConfirmedDisable = async () => {
    const { vehicleId } = confirmationDialog;
    const vehicle = vehicles.find(v => v.vehicleId === vehicleId);
    
    if (!vehicle) {
      setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
      return;
    }

    const isAfterThirdNotification = (vehicle.daysOverdue || 0) >= 3;

    // Retry with admin confirmation
    const result = await mqttTracker.sendCommand(vehicleId, 'disable', {
      isAfterThirdNotification,
      adminConfirmed: true,
    });

    if (result.success) {
      setVehicles(prev => prev.map(v => 
        v.vehicleId === vehicleId ? { ...v, ignitionStatus: false } : v
      ));
      toast.success('Vehicle disabled with admin override');
    } else {
      toast.error(result.message);
    }

    setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleEnableVehicle = async (vehicleId: string) => {
    const result = await mqttTracker.sendCommand(vehicleId, 'enable');
    
    if (result.success) {
      setVehicles(prev => prev.map(v => 
        v.vehicleId === vehicleId ? { ...v, ignitionStatus: true } : v
      ));
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  // Runs a live provider sync (Traccar → EMQX fallback), then replots every
  // device at its newest fix.
  const refreshVehicles = async () => {
    const res = await syncNow();
    if (res.ok) toast.success(res.message);
    else toast.error('Sync failed', { description: res.message });
  };

  const activeVehicles = vehicles.filter(v => v.ignitionStatus && !v.isParked).length;
  const parkedVehicles = vehicles.filter(v => v.isParked && v.ignitionStatus).length;
  const disabledVehicles = vehicles.filter(v => !v.ignitionStatus).length;
  const silentVehicles = vehicles.filter(v => v.isStale).length;
  const points = useMemo(
    () => vehicles.map(v => [v.latitude, v.longitude] as [number, number]),
    [vehicles],
  );

  return (
    <div className="space-y-4">
      {/* Safety Rules Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-amber-700">Vehicle Deactivation Safety Rules</p>
          <ul className="mt-1 text-amber-600/80 space-y-0.5">
            <li>• Vehicles can only be disabled when <strong>parked</strong> (speed &lt; 2 mph)</li>
            <li>• Automatic deactivation allowed only between <strong>1:00 AM - 5:00 AM</strong></li>
            <li>• Outside safe hours, <strong>admin confirmation</strong> is required</li>
            <li>• After 3rd payment notification, deactivation is allowed anytime (if parked)</li>
          </ul>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Select 
            value={selectedRegion.id} 
            onValueChange={(id) => setSelectedRegion(regions.find(r => r.id === id) || regions[0])}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header-usa" disabled className="font-semibold text-primary">
                🇺🇸 USA (DMV States)
              </SelectItem>
              {regions.filter(r => r.country === 'USA').map(r => (
                <SelectItem key={r.id} value={r.id} className="pl-6">
                  {r.name}
                </SelectItem>
              ))}
              <SelectItem value="header-nigeria" disabled className="font-semibold text-primary">
                🇳🇬 Nigeria
              </SelectItem>
              {regions.filter(r => r.country === 'Nigeria').map(r => (
                <SelectItem key={r.id} value={r.id} className="pl-6">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1">
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={refreshVehicles}
            disabled={syncing || loading}
            className="gap-1"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          
          {isConnected ? (
            <Button size="sm" variant="secondary" onClick={disconnectMQTT}>
              Disconnect
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="hero" 
              onClick={connectMQTT}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Live'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <Car className="w-5 h-5 text-green-500" />
          <div>
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="font-semibold text-green-600">{activeVehicles}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Car className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-xs text-muted-foreground">Parked</p>
            <p className="font-semibold text-amber-600">{parkedVehicles}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-xs text-muted-foreground">Disabled</p>
            <p className="font-semibold text-red-600">{disabledVehicles}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
          <WifiOff className="w-5 h-5 text-slate-500" />
          <div>
            <p className="text-xs text-muted-foreground">Silent</p>
            <p className="font-semibold text-slate-600">{silentVehicles}</p>
          </div>
        </div>
      </div>

      {/* Offline / last-seen alerting */}
      <OfflineAlertControls
        devices={devices}
        thresholdMinutes={thresholdMinutes}
        onThresholdChange={setThresholdMinutes}
      />

      {/* Provider merge indicator — every provider plots on THIS single map */}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Plotted on this shared map:</span>
        {(['traccar', 'sarekon', 'emqx'] as const).map((p) => {
          const count = devices.filter((d) => (d.provider ?? 'emqx') === p).length;
          return (
            <span
              key={p}
              className={`rounded-full border px-2 py-0.5 capitalize ${count > 0 ? 'border-primary/40 text-foreground' : 'opacity-60'}`}
            >
              {p}: {count}
            </span>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive">Could not load device positions: {error}</p>
      )}

      {!loading && !error && vehicles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No device positions stored yet — run <strong>Sync now</strong> to pull the latest fixes from the
          telemetry provider.
        </p>
      )}

      {/* Map */}
      <div className="h-[500px] xl:h-[min(760px,72dvh)] rounded-xl overflow-hidden border border-border">
        <MapContainer
          center={[selectedRegion.center.lat, selectedRegion.center.lng]}
          zoom={selectedRegion.zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController center={selectedRegion.center} zoom={selectedRegion.zoom} />
          <FitToDevices points={points} />

          {vehicles.map(vehicle => (
            <VehicleMarker
              key={vehicle.vehicleId}
              vehicle={vehicle}
              onDisable={handleDisableVehicle}
              onEnable={handleEnableVehicle}
            />
          ))}
        </MapContainer>
      </div>


      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Active (Moving)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Parked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Disabled</span>
        </div>
      </div>

      {/* Admin Confirmation Dialog */}
      <AlertDialog 
        open={confirmationDialog.isOpen} 
        onOpenChange={(open) => setConfirmationDialog(prev => ({ ...prev, isOpen: open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Admin Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are attempting to disable <strong>{confirmationDialog.vehicleName}</strong> outside 
                of the safe deactivation window (1:00 AM - 5:00 AM).
              </p>
              {confirmationDialog.safetyCheck?.vehicleStatus && (
                <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                  <p>• Vehicle is currently: <strong>{confirmationDialog.safetyCheck.vehicleStatus.isParked ? 'Parked' : 'Moving'}</strong></p>
                  <p>• Current speed: <strong>{Math.round(confirmationDialog.safetyCheck.vehicleStatus.speed)} mph</strong></p>
                  <p>• Current time: <strong>{new Date().toLocaleTimeString()}</strong></p>
                </div>
              )}
              <p className="text-destructive font-medium">
                Are you sure you want to proceed with vehicle deactivation?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmedDisable}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VehicleTrackingMap;
