import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, ArrowRight, Gauge, Battery, Navigation, Car, RefreshCw } from 'lucide-react';
import { useOwnerVehicleLocations, type OwnerTrackedVehicle } from '@/hooks/useOwnerVehicleLocations';

function FitOverviewBounds({ vehicles }: { vehicles: OwnerTrackedVehicle[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = vehicles
      .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
      .map((v) => [v.latitude, v.longitude] as [number, number]);

    if (valid.length === 0) return;

    try {
      if (valid.length === 1) {
        map.setView(valid[0], 12);
      } else {
        const bounds = L.latLngBounds(valid);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      }
    } catch (e) {
      console.warn('FitOverviewBounds caught:', e);
    }
  }, [vehicles, map]);

  return null;
}

function createMiniVehicleIcon(status: string) {
  const bg =
    status === 'moving'
      ? '#10b981'
      : status === 'parked'
      ? '#f59e0b'
      : status === 'idle'
      ? '#0284c7'
      : status === 'depot'
      ? '#6366f1'
      : '#64748b';

  return L.divIcon({
    className: 'mini-vehicle-icon',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        background: ${bg};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

interface Props {
  onNavigateTab: (tab: string) => void;
}

export function OwnerFleetMapWidget({ onNavigateTab }: Props) {
  const { vehicles, stats, loading, syncing, syncTraccar } = useOwnerVehicleLocations();

  const centerCoords = useMemo<[number, number]>(() => {
    const first = vehicles.find((v) => Number.isFinite(v.latitude));
    if (first) return [first.latitude, first.longitude];
    return [38.9072, -77.0369];
  }, [vehicles]);

  return (
    <Card className="overflow-hidden border-border">
      <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
            Live Fleet Locations
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30">
              Traccar GPS
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {stats.moving} moving · {stats.parked + stats.idle} parked · {stats.total} total registered
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => syncTraccar()}
            disabled={syncing}
            title="Poll fresh GPS coordinates from Traccar"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 font-medium"
            onClick={() => onNavigateTab('iot-device')}
          >
            Full Map
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        <div className="h-[240px] w-full relative bg-muted/20">
          <MapContainer
            center={centerCoords}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <FitOverviewBounds vehicles={vehicles} />

            {vehicles.map((v) => (
              <Marker
                key={v.id}
                position={[v.latitude, v.longitude]}
                icon={createMiniVehicleIcon(v.motionStatus)}
              >
                <Popup minWidth={220}>
                  <div className="p-1 space-y-2">
                    <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                      <span>{v.year ? `${v.year} ` : ''}{v.make} {v.model}</span>
                      <Badge variant="secondary" className="text-[9px] capitalize">{v.motionStatus}</Badge>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground">{v.licensePlate}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" /> {v.speedMph} mph
                      </span>
                      <span className="flex items-center gap-1">
                        <Battery className="h-3 w-3" /> {v.batteryLevel !== null ? `${v.batteryLevel}%` : 'OK'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-6 text-[10px] mt-1"
                      onClick={() => onNavigateTab('iot-device')}
                    >
                      Track Live in Fleet Map
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Overlay if no vehicles */}
          {vehicles.length === 0 && !loading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4 z-[400] text-center">
              <div>
                <Car className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs font-medium">No vehicles registered yet</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs mt-2"
                  onClick={() => onNavigateTab('vehicles')}
                >
                  Add a Vehicle
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
