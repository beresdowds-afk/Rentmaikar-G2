import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Activity, AlertTriangle } from "lucide-react";
import orchestrator from "@/services/residentOrchestrator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY = "rentmaikar_telemetry_stall_window_min";

type FeedKey = "traccar" | "mqtt";

function statusFor(lastAt: number | null, windowMs: number) {
  if (!lastAt) return { level: "unknown" as const, label: "no events yet" };
  const age = Date.now() - lastAt;
  if (age > windowMs) return { level: "stalled" as const, label: `${Math.round(age / 1000)}s ago` };
  if (age > windowMs * 0.5) return { level: "warn" as const, label: `${Math.round(age / 1000)}s ago` };
  return { level: "ok" as const, label: `${Math.round(age / 1000)}s ago` };
}

const badgeVariant = (level: string) =>
  level === "ok" ? "default" : level === "warn" ? "secondary" : level === "stalled" ? "destructive" : "outline";

export default function TelemetryHealthCard() {
  const initial = Number(localStorage.getItem(STORAGE_KEY)) || 5;
  const [windowMin, setWindowMin] = useState(initial);
  const [, setTick] = useState(0);
  const alertedRef = useRef<Record<FeedKey, boolean>>({ traccar: false, mqtt: false });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(windowMin));
  }, [windowMin]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const windowMs = windowMin * 60_000;
  const health = orchestrator.getFeedHealth();
  const traccar = statusFor(health.lastTraccarEventAt, windowMs);
  const mqtt = statusFor(health.lastMqttEventAt, windowMs);

  useEffect(() => {
    const check = async (feed: FeedKey, level: string) => {
      if (level === "stalled" && !alertedRef.current[feed]) {
        alertedRef.current[feed] = true;
        toast.error(`${feed.toUpperCase()} telemetry stalled — no events in ${windowMin} min`);
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase.from("admin_notifications").insert({
            user_id: userData.user.id,
            type: "telemetry_stall",
            title: `${feed.toUpperCase()} feed stalled`,
            message: `No ${feed} events received in the last ${windowMin} minutes.`,
            metadata: { feed, window_minutes: windowMin } as never,
          } as never);
        }
      } else if (level === "ok") {
        alertedRef.current[feed] = false;
      }
    };
    check("traccar", traccar.level);
    check("mqtt", mqtt.level);
  }, [traccar.level, mqtt.level, windowMin]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Telemetry feed health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Traccar</span>
              <Badge variant={badgeVariant(traccar.level)}>{traccar.level}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Last event: {traccar.label}</p>
          </div>
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">MQTT</span>
              <Badge variant={badgeVariant(mqtt.level)}>{mqtt.level}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Last event: {mqtt.label}</p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Stall alert window
            </span>
            <span className="text-muted-foreground">{windowMin} min</span>
          </div>
          <Slider
            min={1}
            max={60}
            step={1}
            value={[windowMin]}
            onValueChange={(v) => setWindowMin(v[0])}
          />
        </div>
      </CardContent>
    </Card>
  );
}
