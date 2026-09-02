import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, Wifi, WifiOff, Power, PowerOff, MapPin, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import TraccarSettingsPanel, { type TraccarValidationState } from "./TraccarSettingsPanel";
import { useTelemetryProvider, sendTelemetryCommand } from "@/hooks/useTelemetryProvider";

/** HTML-escape untrusted values before interpolating them into marker popups. */
const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));


interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string | null;
}
interface TraccarPosition {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  fixTime: string;
  address: string | null;
  attributes: Record<string, unknown>;
}

const KNOTS_TO_KMH = 1.852;

const iconFor = (status: string) => {
  const color = status === "online" ? "#10B981" : status === "offline" ? "#94a3b8" : "#f59e0b";
  return L.divIcon({
    className: "traccar-car-icon",
    html: `<div style="background:${color};border:2px solid #0A1628;border-radius:50%;width:22px;height:22px;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
};

interface ClusterProps {
  devices: TraccarDevice[];
  posByDevice: Map<number, TraccarPosition>;
  busyCmd: number | null;
  onCommand: (deviceId: number, type: "engineStop" | "engineResume") => void;
}

const ClusterLayer = ({ devices, posByDevice, busyCmd, onCommand }: ClusterProps) => {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const handlersRef = useRef({ busyCmd, onCommand });
  handlersRef.current = { busyCmd, onCommand };

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 60,
      chunkedLoading: true,
    }) as L.MarkerClusterGroup;
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const pts: [number, number][] = [];
    devices.forEach((d) => {
      const p = posByDevice.get(d.id);
      if (!p) return;
      pts.push([p.latitude, p.longitude]);
      const speedKmh = Math.round((p.speed ?? 0) * KNOTS_TO_KMH);
      const isBusy = () => handlersRef.current.busyCmd === d.id;
      const marker = L.marker([p.latitude, p.longitude], { icon: iconFor(d.status) });
      const container = document.createElement("div");
      container.className = "space-y-2 min-w-[220px]";
      // Device names/addresses come from the external Traccar server, so they
      // are untrusted input — escape before injecting into the popup markup.
      container.innerHTML = `
        <div class="font-semibold text-sm">${esc(d.name || d.uniqueId)}</div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
          <div class="text-muted-foreground">Status</div><div><b>${esc(d.status)}</b></div>
          <div class="text-muted-foreground">Speed</div><div>${speedKmh} km/h</div>
          <div class="text-muted-foreground">Course</div><div>${Math.round(p.course ?? 0)}°</div>
          <div class="text-muted-foreground">Last fix</div><div>${esc(new Date(p.fixTime).toLocaleString())}</div>
          <div class="text-muted-foreground">Traccar ID</div><div class="font-mono">${esc(d.id)}</div>
        </div>
        ${p.address ? `<div class="text-xs text-muted-foreground">${esc(p.address)}</div>` : ""}
        <div class="flex gap-1 pt-1" data-actions></div>
      `;
      const actions = container.querySelector("[data-actions]")!;
      const stopBtn = document.createElement("button");
      stopBtn.className = "px-2 py-1 text-xs rounded bg-red-600 text-white disabled:opacity-50";
      stopBtn.textContent = "Immobilize";
      stopBtn.onclick = () => {
        if (isBusy()) return;
        handlersRef.current.onCommand(d.id, "engineStop");
      };
      const resumeBtn = document.createElement("button");
      resumeBtn.className = "px-2 py-1 text-xs rounded border";
      resumeBtn.textContent = "Mobilize";
      resumeBtn.onclick = () => {
        if (isBusy()) return;
        handlersRef.current.onCommand(d.id, "engineResume");
      };
      actions.appendChild(stopBtn);
      actions.appendChild(resumeBtn);
      marker.bindPopup(container, { minWidth: 240, maxWidth: 320 });
      group.addLayer(marker);
    });
    if (pts.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 13 });
      } catch { /* noop */ }
    }
  }, [devices, posByDevice, map]);

  return null;
};

export default function TraccarLiveMap() {
  const [validation, setValidation] = useState<TraccarValidationState>({ status: "idle" });
  const [devices, setDevices] = useState<TraccarDevice[]>([]);
  const [positions, setPositions] = useState<TraccarPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyCmd, setBusyCmd] = useState<number | null>(null);
  const { active: activeProvider } = useTelemetryProvider();

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("traccar-admin", { body });
    if (error) throw error;
    return data as any;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await call({ action: "list_devices" });
      if (res?.configured === false) {
        setDevices([]);
        setPositions([]);
        return;
      }
      setDevices(res?.devices ?? []);
      setPositions(res?.positions ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Traccar data");
    } finally {
      setLoading(false);
    }
  }, [call]);

  const isConnected = validation.status === "ok";

  useEffect(() => {
    if (!isConnected) return;
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [isConnected, refresh]);

  const posByDevice = useMemo(() => {
    const map = new Map<number, TraccarPosition>();
    positions.filter((p) => p.latitude && p.longitude).forEach((p) => map.set(p.deviceId, p));
    return map;
  }, [positions]);

  const sendCommand = async (deviceId: number, type: "engineStop" | "engineResume") => {
    setBusyCmd(deviceId);
    try {
      if (activeProvider && activeProvider !== "traccar") {
        // Route through the active provider selected in Admin → Telemetry Provider.
        const dev = devices.find((d) => d.id === deviceId);
        const res = await sendTelemetryCommand({
          command: type === "engineStop" ? "immobilize" : "mobilize",
          deviceId: dev?.uniqueId,
        });
        if (res?.ok) toast.success(`${type === "engineStop" ? "Immobilize" : "Mobilize"} sent via ${res.provider.toUpperCase()}`);
        else toast.error(`Command rejected by ${activeProvider.toUpperCase()}: ${res?.error ?? "unknown error"}`);
        return;
      }
      const res = await call({ action: "send_command", device_id: deviceId, command: type });
      if (res?.ok) {
        toast.success(`${type === "engineStop" ? "Immobilize" : "Mobilize"} command sent`);
      } else {
        toast.error(`Command rejected by Traccar (${res?.status ?? "unknown"})`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Command failed");
    } finally {
      setBusyCmd(null);
    }
  };

  const online = devices.filter((d) => d.status === "online").length;
  const firstPoint = positions.find((p) => p.latitude && p.longitude);
  const center: [number, number] = firstPoint
    ? [firstPoint.latitude, firstPoint.longitude]
    : [9.082, 8.6753];

  return (
    <div className="space-y-4">
      <TraccarSettingsPanel onStateChange={setValidation} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Live Vehicle Tracking Map (Traccar)
              {activeProvider && (
                <Badge variant={activeProvider === "traccar" ? "secondary" : "outline"}>
                  Commands via {activeProvider.toUpperCase()}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Clustered markers scale to large fleets. Auto-refreshes every 15 s. Command audit at{" "}
              <Link to="/admin/traccar-commands" className="underline">
                /admin/traccar-commands
              </Link>
              .
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : "secondary"} className="gap-1">
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isConnected ? `${online}/${devices.length} online` : "Awaiting validation"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading || !isConnected}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The map is locked until the Traccar connection test above succeeds. Fix any reported
                issues, then hit refresh.
              </AlertDescription>
            </Alert>
          )}
          {error && isConnected && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div
            className={`h-[420px] w-full overflow-hidden rounded-md border transition-opacity ${
              isConnected ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
          >
            <MapContainer
              center={center}
              zoom={6}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {isConnected && (
                <ClusterLayer
                  devices={devices}
                  posByDevice={posByDevice}
                  busyCmd={busyCmd}
                  onCommand={sendCommand}
                />
              )}
            </MapContainer>
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>Devices: {devices.length}</span>
            <span>Live positions: {posByDevice.size}</span>
            {busyCmd != null && (
              <span className="flex items-center gap-1 text-amber-600">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending command to {busyCmd}…
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <PowerOff className="h-3 w-3" /> Immobilize
            <span>·</span>
            <Power className="h-3 w-3" /> Mobilize — safety guard applied server-side.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
