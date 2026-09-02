import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BatteryCharging, RefreshCw } from "lucide-react";
import {
  DEFAULT_LIVE_SYNC_SETTINGS,
  LIVE_SYNC_LIMITS,
  LIVE_SYNC_PRESETS,
  type LiveSyncProfile,
  type LiveSyncSettings,
  isDataSaverActive,
  loadLiveSyncSettings,
  saveLiveSyncSettings,
  subscribeLiveSyncSettings,
} from "@/lib/live-sync-settings";

const PROFILE_OPTIONS: Array<{ value: Exclude<LiveSyncProfile, "custom">; label: string; hint: string }> = [
  { value: "realtime", label: "Realtime", hint: "Freshest data, highest usage" },
  { value: "balanced", label: "Balanced", hint: "Recommended default" },
  { value: "battery_saver", label: "Battery saver", hint: "Fewest wakeups" },
];

const fmt = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} sec`);

/**
 * Lets a user trade freshness for battery/data. Changes apply immediately to
 * the running scheduler in every open tab — no reload required.
 */
export default function LiveSyncSettingsPanel() {
  const [settings, setSettings] = useState<LiveSyncSettings>(DEFAULT_LIVE_SYNC_SETTINGS);
  const [dataSaver, setDataSaver] = useState(false);

  useEffect(() => {
    setSettings(loadLiveSyncSettings());
    setDataSaver(isDataSaverActive());
    return subscribeLiveSyncSettings(setSettings);
  }, []);

  const update = (patch: Partial<LiveSyncSettings>) => setSettings(saveLiveSyncSettings(patch));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" aria-hidden />
          Background sync
        </CardTitle>
        <CardDescription>
          Control how often the app checks for new data and app updates while it runs in the background.
          Slower schedules use less battery and mobile data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-3">
          {PROFILE_OPTIONS.map((opt) => {
            const active = settings.profile === opt.value;
            return (
              <Button
                key={opt.value}
                type="button"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                className="h-auto flex-col items-start gap-1 py-3 text-left"
                onClick={() => update({ profile: opt.value, ...LIVE_SYNC_PRESETS[opt.value] })}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="text-xs opacity-80">{opt.hint}</span>
              </Button>
            );
          })}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="live-sync-heartbeat">Data refresh interval</Label>
              <Badge variant="secondary">{fmt(settings.heartbeatMs)}</Badge>
            </div>
            <Slider
              id="live-sync-heartbeat"
              min={LIVE_SYNC_LIMITS.minHeartbeatMs / 1000}
              max={LIVE_SYNC_LIMITS.maxHeartbeatMs / 1000}
              step={15}
              value={[settings.heartbeatMs / 1000]}
              onValueChange={([v]) => update({ profile: "custom", heartbeatMs: v * 1000 })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="live-sync-version">App update check</Label>
              <Badge variant="secondary">{fmt(settings.versionCheckMs)}</Badge>
            </div>
            <Slider
              id="live-sync-version"
              min={LIVE_SYNC_LIMITS.minVersionCheckMs / 60_000}
              max={LIVE_SYNC_LIMITS.maxVersionCheckMs / 60_000}
              step={1}
              value={[settings.versionCheckMs / 60_000]}
              onValueChange={([v]) => update({ profile: "custom", versionCheckMs: v * 60_000 })}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="live-sync-pause">Pause while in the background</Label>
              <p className="text-sm text-muted-foreground">
                Stops all timers when the app is not on screen; everything refreshes the moment you return.
              </p>
            </div>
            <Switch
              id="live-sync-pause"
              checked={settings.pauseWhenHidden}
              onCheckedChange={(v) => update({ pauseWhenHidden: v })}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="live-sync-savedata">Respect Data Saver</Label>
              <p className="text-sm text-muted-foreground">
                Slows checks down 3× on Data Saver or a slow 2G/3G connection.
              </p>
            </div>
            <Switch
              id="live-sync-savedata"
              checked={settings.respectSaveData}
              onCheckedChange={(v) => update({ respectSaveData: v })}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="live-sync-battery">Slow down on low battery</Label>
              <p className="text-sm text-muted-foreground">
                Applies the same 3× back-off below 20% battery while unplugged.
              </p>
            </div>
            <Switch
              id="live-sync-battery"
              checked={settings.adaptOnLowBattery}
              onCheckedChange={(v) => update({ adaptOnLowBattery: v })}
            />
          </div>
        </div>

        {dataSaver && settings.respectSaveData && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BatteryCharging className="h-4 w-4" aria-hidden />
            Data Saver is active — checks are currently running 3× less often.
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => update(DEFAULT_LIVE_SYNC_SETTINGS)}
        >
          Reset to recommended
        </Button>
      </CardContent>
    </Card>
  );
}
