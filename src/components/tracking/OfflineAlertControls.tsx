import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BellRing, Loader2, SatelliteDish } from "lucide-react";
import { toast } from "sonner";
import { minutesSince, type FleetDevice } from "@/hooks/useFleetDeviceLocations";

const THRESHOLDS = [15, 30, 60, 120, 360, 720, 1440];

const label = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : m < 1440 ? `${m / 60} hours` : "24 hours");

interface Props {
  devices: FleetDevice[];
  thresholdMinutes: number;
  onThresholdChange: (m: number) => void;
}

/**
 * Offline / last-seen alerting: pick how long a tracker may stay silent before
 * it counts as offline, and notify the IoT admins on demand. The same
 * threshold is persisted server-side and used by the scheduled check.
 */
export function OfflineAlertControls({ devices, thresholdMinutes, onThresholdChange }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("iot-offline-alerts", {
        body: { action: "get_config" },
      });
      const cfg = (data as { config?: { enabled: boolean; threshold_minutes: number } })?.config;
      if (cfg) {
        setEnabled(cfg.enabled);
        onThresholdChange(cfg.threshold_minutes);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async (next: { enabled?: boolean; threshold_minutes?: number }) => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("iot-offline-alerts", {
        body: { action: "set_config", ...next },
      });
      if (error) throw error;
      toast.success("Offline alert settings saved");
    } catch (e) {
      toast.error("Could not save alert settings", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, []);

  const runCheck = async () => {
    setNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("iot-offline-alerts", {
        body: { action: "check", threshold_minutes: thresholdMinutes, notify: true },
      });
      if (error) throw error;
      const r = data as { stale_count?: number; notified?: number; checked?: number };
      const msg = `${r.stale_count ?? 0} of ${r.checked ?? 0} device(s) silent — ${r.notified ?? 0} alert(s) sent`;
      setLastResult(msg);
      toast.success(msg);
    } catch (e) {
      toast.error("Offline check failed", { description: (e as Error).message });
    } finally {
      setNotifying(false);
    }
  };

  const stale = devices.filter((d) => {
    const m = minutesSince(d.lastPing);
    return m === null || m > thresholdMinutes;
  });

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SatelliteDish className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Offline / last-seen alerts</span>
          <Badge variant={stale.length ? "destructive" : "secondary"}>
            {stale.length} silent
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="offline-enabled" className="text-xs text-muted-foreground">Enabled</Label>
            <Switch
              id="offline-enabled"
              checked={enabled}
              disabled={saving}
              onCheckedChange={(v) => { setEnabled(v); persist({ enabled: v }); }}
            />
          </div>
          <Select
            value={String(thresholdMinutes)}
            onValueChange={(v) => { onThresholdChange(Number(v)); persist({ threshold_minutes: Number(v) }); }}
          >
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLDS.map((m) => (
                <SelectItem key={m} value={String(m)}>No telemetry for {label(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={runCheck} disabled={notifying} className="gap-1">
            {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            Check & notify
          </Button>
        </div>
      </div>

      {lastResult && (
        <Alert>
          <AlertDescription className="text-xs">{lastResult}</AlertDescription>
        </Alert>
      )}

      {stale.length > 0 && (
        <div className="max-h-32 overflow-auto text-xs divide-y divide-border/60">
          {stale.slice(0, 25).map((d) => {
            const m = minutesSince(d.lastPing);
            return (
              <div key={d.deviceRowId} className="flex items-center justify-between py-1.5">
                <span className="font-mono">{d.serialNumber}</span>
                <span className="text-muted-foreground">
                  {d.licensePlate} · {m === null ? "never reported" : `${m} min ago`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default OfflineAlertControls;
