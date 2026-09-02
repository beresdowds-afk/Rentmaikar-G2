import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, Pause, Play, RefreshCw, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TelemetryHealthCard from "@/components/admin/TelemetryHealthCard";

const MAX_EVENTS = 200;

interface TelemetryRow {
  id: string;
  vehicle_id: string;
  data_type: string;
  mqtt_topic: string | null;
  payload: unknown;
  received_at: string;
}

function summarize(payload: unknown): string {
  if (payload == null) return "—";
  if (typeof payload !== "object") return String(payload);
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  const pick = (key: string, label = key) => {
    if (p[key] !== undefined && p[key] !== null) parts.push(`${label}: ${String(p[key])}`);
  };
  pick("speed");
  pick("ignition");
  pick("latitude", "lat");
  pick("longitude", "lng");
  pick("battery");
  if (parts.length === 0) return JSON.stringify(p).slice(0, 140);
  return parts.join(" · ");
}

export default function TelemetryStreamPage() {
  const [events, setEvents] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const loadRecent = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("mqtt_telemetry_logs")
      .select("id, vehicle_id, data_type, mqtt_topic, payload, received_at")
      .order("received_at", { ascending: false })
      .limit(MAX_EVENTS);
    if (err) setError(err.message);
    else {
      setError(null);
      setEvents((data ?? []) as TelemetryRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    const channel = supabase
      .channel("telemetry-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mqtt_telemetry_logs" },
        (payload) => {
          if (pausedRef.current) return;
          const row = payload.new as TelemetryRow;
          setEvents((prev) => [row, ...prev].slice(0, MAX_EVENTS));
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = vehicleFilter.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.vehicle_id.toLowerCase().includes(q) ||
        e.data_type.toLowerCase().includes(q) ||
        (e.mqtt_topic ?? "").toLowerCase().includes(q),
    );
  }, [events, vehicleFilter]);

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-display font-bold">
            <Radio className="h-7 w-7 text-primary" />
            Live Telemetry Stream
          </h1>
          <p className="text-muted-foreground">
            Real-time vehicle events as they arrive from Traccar and the MQTT broker.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={connected ? "default" : "outline"}>
            <Activity className="mr-1 h-3 w-3" />
            {connected ? "Connected" : "Connecting…"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadRecent()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Admin
            </Link>
          </Button>
        </div>
      </div>

      <TelemetryHealthCard />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load telemetry</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Event feed</CardTitle>
              <CardDescription>
                Showing the latest {MAX_EVENTS} events{paused ? " (paused)" : ""}.
              </CardDescription>
            </div>
            <Input
              className="max-w-xs"
              placeholder="Filter by vehicle, type or topic"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No telemetry events yet. New events will appear here automatically.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {e.data_type}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.vehicle_id.slice(0, 8)}…
                  </span>
                  <span className="flex-1 truncate text-sm">{summarize(e.payload)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.received_at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
