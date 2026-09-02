import { useRegion } from "@/contexts/RegionContext";
import { useRealtimeSound } from "@/hooks/useRealtimeSound";
import { regionPref } from "@/lib/sound-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { BellOff, Play, Volume2 } from "lucide-react";

/**
 * Installed-PWA audio preferences for the real-time sync worker.
 *
 * Everything is opt-in and stored per region so an operator running more than
 * one desk can keep, say, Nigeria loud and the US quiet.
 */
export default function PWASettingsPanel() {
  const { availableRegions, country } = useRegion();
  const {
    settings,
    permission,
    play,
    setWorkerEnabled,
    setMuteWhenFocused,
    setRegionEnabled,
    setRegionVolume,
    requestNotificationPermission,
  } = useRealtimeSound();

  const blocked = permission === "denied";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Real-time alert sounds
        </CardTitle>
        <CardDescription>
          Play a short chime in the installed app when live updates arrive. Sound is off by default
          and can be tuned for each region you work in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {blocked && (
          <Alert variant="destructive">
            <BellOff className="h-4 w-4" />
            <AlertTitle>Notifications are blocked</AlertTitle>
            <AlertDescription>
              Your browser is blocking notifications for this site, so alert sounds stay off. Allow
              notifications in your browser settings to enable them.
            </AlertDescription>
          </Alert>
        )}
        {permission === "default" && (
          <Alert>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Allow notifications so alerts still reach you in the background.</span>
              <Button size="sm" variant="outline" onClick={() => void requestNotificationPermission()}>
                Allow
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="sound-worker">Sound worker</Label>
            <p className="text-xs text-muted-foreground">
              Master switch for every region on this device.
            </p>
          </div>
          <Switch
            id="sound-worker"
            checked={settings.workerEnabled}
            disabled={blocked}
            onCheckedChange={setWorkerEnabled}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="mute-focused">Stay silent while I'm looking</Label>
            <p className="text-xs text-muted-foreground">
              Skip the chime when this window is already focused.
            </p>
          </div>
          <Switch
            id="mute-focused"
            checked={settings.muteWhenFocused}
            disabled={blocked || !settings.workerEnabled}
            onCheckedChange={setMuteWhenFocused}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          {availableRegions.map((region) => {
            const pref = regionPref(settings, region.value);
            const disabled = blocked || !settings.workerEnabled;
            return (
              <div key={region.value} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor={`sound-${region.value}`}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <span>{region.flag}</span>
                    {region.label}
                    {region.value === country && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        (current)
                      </span>
                    )}
                  </Label>
                  <Switch
                    id={`sound-${region.value}`}
                    checked={pref.enabled}
                    disabled={disabled}
                    onCheckedChange={(v) => setRegionEnabled(region.value, v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Slider
                    aria-label={`${region.label} volume`}
                    value={[Math.round(pref.volume * 100)]}
                    min={0}
                    max={100}
                    step={5}
                    disabled={disabled || !pref.enabled}
                    onValueChange={([v]) => setRegionVolume(region.value, (v ?? 0) / 100)}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-xs text-muted-foreground">
                    {Math.round(pref.volume * 100)}%
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || !pref.enabled}
                    onClick={() => play(true)}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    Test
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
