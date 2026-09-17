import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Car,
  Navigation,
  Gauge,
  Battery,
  MapPin,
  RefreshCw,
  Search,
  Maximize2,
  Minimize2,
  ExternalLink,
  Layers,
  Radio,
  Clock,
  User,
  Phone,
  Power,
  Zap,
  Info,
  CheckCircle,
  AlertCircle,
  Copy,
  LocateFixed,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOwnerVehicleLocations, type OwnerTrackedVehicle, type MotionStatus } from '@/hooks/useOwnerVehicleLocations';

// Map tile layers
type TileProvider = 'osm' | 'voyager' | 'dark' | 'satellite';

const TILE_PROVIDERS: Record<TileProvider, { name: string; url: string; attribution: string }> = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  voyager: {
    name: 'Clean Street (Voyager)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    name: 'Night Mode',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    name: 'Satellite View',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },
};

// Map controller to focus on selected vehicle
function FocusVehicleController({ vehicle }: { vehicle: OwnerTrackedVehicle | null }) {
  const map = useMap();
  useEffect(() => {
    if (!vehicle) return;
    if (Number.isFinite(vehicle.latitude) && Number.isFinite(vehicle.longitude)) {
      try {
        map.flyTo([vehicle.latitude, vehicle.longitude], 15, {
          duration: 1.2,
          easeLinearity: 0.25,
        });
      } catch (err) {
        console.warn('Map focus catch:', err);
      }
    }
  }, [vehicle, map]);
  return null;
}

// Map controller to fit all vehicle markers in view
function FitFleetController({
  vehicles,
  triggerFit,
}: {
  vehicles: OwnerTrackedVehicle[];
  triggerFit: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (vehicles.length === 0) return;
    const validPoints = vehicles
      .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
      .map((v) => [v.latitude, v.longitude] as [number, number]);

    if (validPoints.length === 0) return;

    try {
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 14);
      } else {
        const bounds = L.latLngBounds(validPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    } catch (err) {
      console.warn('FitFleet catch:', err);
    }
  }, [vehicles, triggerFit, map]);

  return null;
}

// Convert compass degrees to cardinal text
function degreesToCardinal(deg: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return `${deg}° ${cardinals[idx]}`;
}

// Humanize timestamp relative age
function formatAge(isoString: string | null): string {
  if (!isoString) return 'No fix yet';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Generate custom SVG DivIcon for vehicle
function createVehicleDivIcon(vehicle: OwnerTrackedVehicle, isSelected: boolean): L.DivIcon {
  const { motionStatus, speedMph, course } = vehicle;

  let bg = '#64748b'; // default slate (offline)
  let ring = '#cbd5e1';
  let pulse = false;

  if (motionStatus === 'moving') {
    bg = '#10b981'; // emerald
    ring = '#a7f3d0';
    pulse = true;
  } else if (motionStatus === 'idle') {
    bg = '#0284c7'; // sky blue
    ring = '#bae6fd';
  } else if (motionStatus === 'parked') {
    bg = '#f59e0b'; // amber
    ring = '#fde68a';
  } else if (motionStatus === 'depot') {
    bg = '#6366f1'; // indigo hub
    ring = '#c7d2fe';
  }

  const markerSize = isSelected ? 44 : 38;
  const half = markerSize / 2;
  const arrowDeg = course || 0;

  const html = `
    <div style="position: relative; width: ${markerSize}px; height: ${markerSize}px;">
      ${
        pulse
          ? `<div style="
              position: absolute;
              inset: -6px;
              border-radius: 50%;
              background: ${bg};
              opacity: 0.35;
              animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>`
          : ''
      }
      <div style="
        width: ${markerSize}px;
        height: ${markerSize}px;
        background: ${bg};
        border: ${isSelected ? '4px solid #ffffff' : '3px solid #ffffff'};
        border-radius: 50%;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="${isSelected ? 22 : 18}" height="${isSelected ? 22 : 18}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
        ${
          motionStatus === 'moving'
            ? `<div style="
                position: absolute;
                top: -5px;
                right: -5px;
                width: 16px;
                height: 16px;
                background: #0f172a;
                border: 1.5px solid #ffffff;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transform: rotate(${arrowDeg}deg);
              ">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff">
                  <polygon points="12 2 19 21 12 17 5 21 12 2"/>
                </svg>
              </div>`
            : ''
        }
      </div>
      ${
        motionStatus === 'moving' && speedMph > 0
          ? `<div style="
              position: absolute;
              bottom: -16px;
              left: 50%;
              transform: translateX(-50%);
              background: #0f172a;
              color: #ffffff;
              font-size: 10px;
              font-weight: 700;
              padding: 1px 5px;
              border-radius: 6px;
              white-space: nowrap;
              border: 1px solid rgba(255,255,255,0.4);
              box-shadow: 0 2px 4px rgba(0,0,0,0.25);
            ">${speedMph} mph</div>`
          : ''
      }
    </div>
  `;

  return L.divIcon({
    className: 'custom-vehicle-pin',
    html,
    iconSize: [markerSize, markerSize],
    iconAnchor: [half, half],
    popupAnchor: [0, -half - 8],
  });
}

interface Props {
  initialVehicleId?: string | null;
  onSelectVehicle?: (vehicleId: string) => void;
}

export function OwnerVehicleTrackingMap({ initialVehicleId, onSelectVehicle }: Props) {
  const {
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
    refresh,
    syncTraccar,
  } = useOwnerVehicleLocations();

  const [tileProvider, setTileProvider] = useState<TileProvider>('voyager');
  const [statusFilter, setStatusFilter] = useState<'all' | MotionStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [triggerFit, setTriggerFit] = useState(1);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  // Sync initial selection from props if provided
  useEffect(() => {
    if (initialVehicleId) {
      setSelectedVehicleId(initialVehicleId);
    }
  }, [initialVehicleId, setSelectedVehicleId]);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      // Status filter
      if (statusFilter !== 'all' && v.motionStatus !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = `${v.year || ''} ${v.make} ${v.model}`.toLowerCase().includes(q);
        const matchPlate = v.licensePlate.toLowerCase().includes(q);
        const matchDriver = (v.assignedDriver?.fullName || '').toLowerCase().includes(q);
        const matchCity = (v.pickupCity || '').toLowerCase().includes(q);
        if (!matchTitle && !matchPlate && !matchDriver && !matchCity) {
          return false;
        }
      }
      return true;
    });
  }, [vehicles, statusFilter, searchQuery]);

  // Fallback map center
  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedVehicle && Number.isFinite(selectedVehicle.latitude)) {
      return [selectedVehicle.latitude, selectedVehicle.longitude];
    }
    const firstWithCoords = vehicles.find((v) => Number.isFinite(v.latitude));
    if (firstWithCoords) {
      return [firstWithCoords.latitude, firstWithCoords.longitude];
    }
    return [38.9072, -77.0369]; // Default Washington DC
  }, [selectedVehicle, vehicles]);

  // Handle vehicle click
  const handleSelectVehicle = useCallback(
    (vehicleId: string) => {
      setSelectedVehicleId(vehicleId);
      onSelectVehicle?.(vehicleId);
      const marker = markerRefs.current[vehicleId];
      if (marker) {
        marker.openPopup();
      }
    },
    [setSelectedVehicleId, onSelectVehicle]
  );

  // Trigger Traccar sync
  const handleSync = async () => {
    toast.info('Connecting to Traccar telemetry server…');
    const result = await syncTraccar();
    if (result.ok) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const copyCoordinates = (lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    toast.success('GPS coordinates copied to clipboard');
  };

  return (
    <div
      className={`space-y-4 ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background p-4 flex flex-col overflow-y-auto'
          : 'relative'
      }`}
    >
      {/* Top Header Card */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Radio className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    Live Vehicle Fleet Map
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                      Traccar Telemetry
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Real-time GPS coordinates, speed, heading, and ignition monitoring powered by Traccar.
                  </CardDescription>
                </div>
              </div>
            </div>

            {/* Quick Status Stats */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                Total: {stats.total}
              </Badge>
              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                Moving: {stats.moving}
              </Badge>
              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                Parked: {stats.parked + stats.idle}
              </Badge>
              {stats.offline > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Offline: {stats.offline}
                </Badge>
              )}
              {stats.depot > 0 && (
                <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-200">
                  Depot: {stats.depot}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Map Controls Toolbar */}
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1 border-t">
            {/* Left Controls: Search & Filters */}
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter by plate, make, city…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              {/* Vehicle Select Dropdown */}
              <div className="w-full sm:w-56">
                <Select
                  value={selectedVehicleId || 'all'}
                  onValueChange={(val) => {
                    if (val === 'all') {
                      setSelectedVehicleId(null);
                      setTriggerFit((prev) => prev + 1);
                    } else {
                      handleSelectVehicle(val);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Focus on Vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Focus on All Vehicles ({vehicles.length})</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.year ? `${v.year} ` : ''}{v.make} {v.model} ({v.licensePlate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1">
                {(['all', 'moving', 'parked', 'offline'] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={statusFilter === st ? 'default' : 'outline'}
                    className="h-8 text-xs capitalize px-2.5"
                    onClick={() => setStatusFilter(st)}
                  >
                    {st}
                  </Button>
                ))}
              </div>
            </div>

            {/* Right Controls: Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Tile Style Selector */}
              <Select value={tileProvider} onValueChange={(val: TileProvider) => setTileProvider(val)}>
                <SelectTrigger className="h-8 text-xs w-36 gap-1">
                  <Layers className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TILE_PROVIDERS).map(([key, provider]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Fit Bounds Button */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setTriggerFit((prev) => prev + 1)}
                title="Fit all fleet vehicles into map frame"
              >
                <LocateFixed className="h-3.5 w-3.5" />
                Fit Fleet
              </Button>

              {/* Traccar Sync Button */}
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
                onClick={handleSync}
                disabled={syncing}
                title="Poll fresh GPS coordinates from Traccar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing Traccar…' : 'Sync Traccar'}
              </Button>

              {/* Fullscreen Toggle */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Sync indicator banner */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Last Traccar update: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'Awaiting sync'}
              {autoRefreshInterval > 0 && ` · Auto-refresh ${autoRefreshInterval}s`}
            </span>
            <span>
              Showing {filteredVehicles.length} of {vehicles.length} vehicles
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Main Map Container */}
      <div
        className={`relative w-full rounded-xl overflow-hidden border border-border shadow-sm bg-muted/20 ${
          isFullscreen ? 'flex-1 min-h-[500px]' : 'h-[520px]'
        }`}
      >
        <MapContainer
          center={mapCenter}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            url={TILE_PROVIDERS[tileProvider].url}
            attribution={TILE_PROVIDERS[tileProvider].attribution}
            maxZoom={19}
          />

          <FocusVehicleController vehicle={selectedVehicle} />
          <FitFleetController vehicles={filteredVehicles} triggerFit={triggerFit} />

          {/* Render Vehicle Markers */}
          {filteredVehicles.map((vehicle) => {
            const isSelected = selectedVehicleId === vehicle.id;
            const icon = createVehicleDivIcon(vehicle, isSelected);

            return (
              <Marker
                key={vehicle.id}
                position={[vehicle.latitude, vehicle.longitude]}
                icon={icon}
                ref={(ref) => {
                  if (ref) {
                    markerRefs.current[vehicle.id] = ref;
                  } else {
                    delete markerRefs.current[vehicle.id];
                  }
                }}
                eventHandlers={{
                  click: () => {
                    handleSelectVehicle(vehicle.id);
                  },
                }}
              >
                <Popup className="owner-vehicle-popup" minWidth={280} maxWidth={320}>
                  <div className="space-y-3 p-1">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b pb-2">
                      <div>
                        <h4 className="font-bold text-sm text-foreground">
                          {vehicle.year ? `${vehicle.year} ` : ''}
                          {vehicle.make} {vehicle.model}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 bg-muted/60">
                            {vehicle.licensePlate}
                          </Badge>
                          {vehicle.color && (
                            <span className="text-[11px] text-muted-foreground capitalize">
                              · {vehicle.color}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge
                        className={`text-[10px] px-2 py-0.5 capitalize ${
                          vehicle.motionStatus === 'moving'
                            ? 'bg-emerald-600 text-white'
                            : vehicle.motionStatus === 'parked'
                            ? 'bg-amber-600 text-white'
                            : vehicle.motionStatus === 'idle'
                            ? 'bg-sky-600 text-white'
                            : vehicle.motionStatus === 'depot'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-500 text-white'
                        }`}
                      >
                        {vehicle.motionStatus === 'depot' ? 'At Depot' : vehicle.motionStatus}
                      </Badge>
                    </div>

                    {/* Telemetry Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/40 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                          <Gauge className="h-3 w-3" /> Speed
                        </div>
                        <p className="font-bold text-sm mt-0.5 text-foreground">
                          {vehicle.speedMph} <span className="text-[10px] font-normal text-muted-foreground">mph</span>
                          <span className="text-[10px] text-muted-foreground ml-1">({vehicle.speedKmh} km/h)</span>
                        </p>
                      </div>

                      <div className="bg-muted/40 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                          <Navigation className="h-3 w-3" /> Heading
                        </div>
                        <p className="font-bold text-sm mt-0.5 text-foreground">
                          {degreesToCardinal(vehicle.course)}
                        </p>
                      </div>

                      <div className="bg-muted/40 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                          <Battery className="h-3 w-3" /> Battery
                        </div>
                        <p className="font-bold text-sm mt-0.5 text-foreground">
                          {vehicle.batteryLevel !== null ? `${vehicle.batteryLevel}%` : 'Normal'}
                        </p>
                      </div>

                      <div className="bg-muted/40 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                          <Power className="h-3 w-3" /> Ignition
                        </div>
                        <p className="font-bold text-sm mt-0.5 text-foreground">
                          {vehicle.ignition === true ? (
                            <span className="text-emerald-600 dark:text-emerald-400">On</span>
                          ) : vehicle.ignition === false ? (
                            <span className="text-muted-foreground">Off</span>
                          ) : (
                            <span>Active</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Address / Location */}
                    {vehicle.currentAddress && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed">{vehicle.currentAddress}</span>
                      </div>
                    )}

                    {/* Driver Information if rented */}
                    {vehicle.assignedDriver ? (
                      <div className="flex items-center justify-between text-xs bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2 rounded-lg text-emerald-900 dark:text-emerald-200">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="font-medium truncate max-w-[140px]">
                            {vehicle.assignedDriver.fullName || 'Active Driver'}
                          </span>
                        </div>
                        {vehicle.assignedDriver.phone && (
                          <a
                            href={`tel:${vehicle.assignedDriver.phone}`}
                            className="inline-flex items-center gap-1 text-[11px] underline font-semibold"
                          >
                            <Phone className="h-3 w-3" /> Call
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" /> Ready for driver assignment
                      </div>
                    )}

                    {/* Footer Info & Actions */}
                    <div className="pt-2 border-t flex flex-col gap-2">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Provider: <b className="uppercase">{vehicle.provider}</b></span>
                        <span>Fix: {formatAge(vehicle.lastPing)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 px-2"
                          onClick={() => copyCoordinates(vehicle.latitude, vehicle.longitude)}
                        >
                          <Copy className="h-3 w-3" /> Copy GPS
                        </Button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${vehicle.latitude},${vehicle.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 h-7 text-[11px] px-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                        >
                          <ExternalLink className="h-3 w-3" /> Maps
                        </a>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating Legend Badge */}
        <div className="absolute bottom-4 right-4 z-[400] bg-background/95 backdrop-blur-sm border rounded-lg p-2.5 shadow-md text-xs space-y-1.5 hidden sm:block">
          <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
            Map Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 inline-block" />
            <span>Moving (Active GPS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200 inline-block" />
            <span>Parked / Stationary</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400 inline-block" />
            <span>Offline Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" />
            <span>Pickup Depot Location</span>
          </div>
        </div>
      </div>

      {/* Vehicle Fleet Cards Carousel / List below map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Car className="h-4 w-4 text-primary" /> Tracked Fleet Vehicles ({filteredVehicles.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Click any vehicle to center & inspect on map
          </span>
        </div>

        {filteredVehicles.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {vehicles.length === 0 ? (
                <div>
                  <p className="font-medium text-foreground">No vehicles listed yet</p>
                  <p className="text-xs mt-1">
                    Add your vehicles in the "My Vehicles" tab to start tracking them via Traccar.
                  </p>
                </div>
              ) : (
                <p>No vehicles match the selected filter criteria.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredVehicles.map((v) => {
              const isSelected = selectedVehicleId === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => handleSelectVehicle(v.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-left space-y-2.5 ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                      : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm leading-tight text-foreground">
                        {v.year ? `${v.year} ` : ''}{v.make} {v.model}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground mt-0.5">
                        {v.licensePlate}
                      </p>
                    </div>
                    <Badge
                      className={`text-[10px] px-2 py-0.5 capitalize ${
                        v.motionStatus === 'moving'
                          ? 'bg-emerald-600 text-white'
                          : v.motionStatus === 'parked'
                          ? 'bg-amber-600 text-white'
                          : v.motionStatus === 'idle'
                          ? 'bg-sky-600 text-white'
                          : v.motionStatus === 'depot'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-500 text-white'
                      }`}
                    >
                      {v.motionStatus === 'depot' ? 'Depot' : v.motionStatus}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
                    <div>
                      <span className="text-[10px] block text-muted-foreground/80">Speed</span>
                      <span className="font-semibold text-foreground">{v.speedMph} mph</span>
                    </div>
                    <div>
                      <span className="text-[10px] block text-muted-foreground/80">Battery</span>
                      <span className="font-semibold text-foreground">
                        {v.batteryLevel !== null ? `${v.batteryLevel}%` : 'OK'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] block text-muted-foreground/80">Fix Age</span>
                      <span className="font-semibold text-foreground">{formatAge(v.lastPing)}</span>
                    </div>
                  </div>

                  {v.currentAddress && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0 text-primary" />
                      {v.currentAddress}
                    </p>
                  )}

                  {v.assignedDriver && (
                    <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center justify-between border-t pt-1.5">
                      <span className="flex items-center gap-1 truncate">
                        <User className="h-3 w-3 text-emerald-600 shrink-0" />
                        {v.assignedDriver.fullName || 'Driver Assigned'}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-600">Active</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
