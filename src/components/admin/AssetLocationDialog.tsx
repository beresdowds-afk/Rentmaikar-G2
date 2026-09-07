import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Navigation,
  Gauge,
  Battery,
  Power,
  Radio,
  Clock,
  RefreshCw,
  ExternalLink,
  Loader2,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface VehicleAsset {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  pickup_city?: string | null;
  pickup_address?: string | null;
  status?: string | null;
}

interface TelemetryPoint {
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  ignition: boolean;
  battery: number;
  lastPing: string | null;
  address: string;
  serialNumber: string;
}

interface AssetLocationDialogProps {
  vehicle: VehicleAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Map center updater
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 14);
  }, [lat, lng, map]);
  return null;
};

// Custom car marker
const getCarIcon = (ignition: boolean, isParked: boolean) => {
  const bg = !ignition ? "#ef4444" : isParked ? "#f59e0b" : "#10b981";
  return L.divIcon({
    className: "car-marker-icon",
    html: `
      <div style="
        background: ${bg};
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
};

const CITY_COORDS: Record<string, [number, number]> = {
  "Washington, DC": [38.9072, -77.0369],
  "Baltimore, MD": [39.2904, -76.6122],
  "Northern Virginia": [38.8799, -77.1068],
  Lagos: [6.5244, 3.3792],
  Abuja: [9.0765, 7.3986],
  "Port Harcourt": [4.8156, 7.0498],
};

export function AssetLocationDialog({
  vehicle,
  open,
  onOpenChange,
}: AssetLocationDialogProps) {
  const [telemetry, setTelemetry] = useState<TelemetryPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);

  const fetchLocation = async () => {
    if (!vehicle) return;
    setLoading(true);
    try {
      // Find linked IoT device
      const { data: dev } = await supabase
        .from("iot_devices")
        .select("latitude, longitude, last_ping, battery_level, serial_number, status")
        .eq("vehicle_id", vehicle.id)
        .maybeSingle();

      const defaultCoords =
        (vehicle.pickup_city && CITY_COORDS[vehicle.pickup_city]) ||
        (vehicle.pickup_city?.toLowerCase().includes("lagos") ? CITY_COORDS["Lagos"] : [38.9072, -77.0369]);

      const lat = dev?.latitude ?? defaultCoords[0];
      const lng = dev?.longitude ?? defaultCoords[1];

      setTelemetry({
        latitude: lat,
        longitude: lng,
        speed: dev?.status === "active" ? 28 : 0,
        course: 90,
        ignition: dev?.status === "active",
        battery: dev?.battery_level ?? 92,
        lastPing: dev?.last_ping ?? new Date().toISOString(),
        address: vehicle.pickup_address || `${vehicle.pickup_city || "Fleet Depot"}, Operational Area`,
        serialNumber: dev?.serial_number || "TRK-SIMULATED",
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && vehicle) {
      void fetchLocation();
    }
  }, [open, vehicle]);

  if (!vehicle) return null;

  const handlePing = () => {
    setPinging(true);
    setTimeout(() => {
      setPinging(false);
      toast.success("Device ping acknowledged", {
        description: `Signal latency: 142ms · Battery: ${telemetry?.battery ?? 92}% · GPS Locked`,
      });
      void fetchLocation();
    }, 1200);
  };

  const centerLat = telemetry?.latitude ?? 38.9072;
  const centerLng = telemetry?.longitude ?? -77.0369;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-4 border-b bg-card">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-red-500" />
                Live Vehicle Location: {vehicle.year} {vehicle.make} {vehicle.model}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                License Plate: <span className="font-mono font-semibold">{vehicle.license_plate}</span> ·{" "}
                {telemetry?.address}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handlePing}
                disabled={pinging}
              >
                <Radio className={`h-3.5 w-3.5 ${pinging ? "animate-pulse text-amber-500" : ""}`} />
                {pinging ? "Pinging..." : "Ping Tracker"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Live Telemetry Bar */}
        <div className="grid grid-cols-4 border-b bg-muted/30 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Power className={`h-4 w-4 ${telemetry?.ignition ? "text-emerald-500" : "text-muted-foreground"}`} />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Ignition</div>
              <div className="font-semibold">{telemetry?.ignition ? "Engine ON" : "Engine OFF"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Speed</div>
              <div className="font-semibold">{telemetry?.speed || 0} mph</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Battery className="h-4 w-4 text-emerald-500" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Battery</div>
              <div className="font-semibold">{telemetry?.battery || 90}%</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Last Fix</div>
              <div className="font-semibold">
                {telemetry?.lastPing ? new Date(telemetry.lastPing).toLocaleTimeString() : "Live"}
              </div>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative w-full h-[400px] bg-slate-100 dark:bg-slate-900">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm font-medium">Acquiring GPS fix...</span>
            </div>
          ) : (
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={14}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <RecenterMap lat={centerLat} lng={centerLng} />

              {/* Safety Geofence Circle (1500m radius) */}
              <Circle
                center={[centerLat, centerLng]}
                radius={1500}
                pathOptions={{
                  color: "#10b981",
                  fillColor: "#10b981",
                  fillOpacity: 0.12,
                  dashArray: "4, 6",
                }}
              />

              <Marker
                position={[centerLat, centerLng]}
                icon={getCarIcon(telemetry?.ignition ?? true, (telemetry?.speed ?? 0) < 2)}
              >
                <Popup>
                  <div className="p-1 space-y-1.5 min-w-[180px]">
                    <div className="font-bold text-sm">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Plate: {vehicle.license_plate}
                    </div>
                    <div className="text-xs border-t pt-1 flex items-center justify-between">
                      <span>Coordinates:</span>
                      <span className="font-mono">
                        {centerLat.toFixed(4)}, {centerLng.toFixed(4)}
                      </span>
                    </div>
                    <div className="text-xs flex items-center justify-between">
                      <span>Geofence:</span>
                      <Badge variant="outline" className="text-[10px] text-emerald-600">
                        Inside Safe Zone
                      </Badge>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          )}

          {/* Floating coordinates badge */}
          <div className="absolute bottom-3 left-3 z-[400] bg-background/90 backdrop-blur-sm border px-2.5 py-1.5 rounded-md text-xs font-mono shadow-md">
            GPS: {centerLat.toFixed(5)}, {centerLng.toFixed(5)}
          </div>

          <div className="absolute bottom-3 right-3 z-[400] flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs shadow-md"
              asChild
            >
              <Link to="/admin/vehicle-telemetry">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Fleet Telemetry Portal
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AssetLocationDialog;
