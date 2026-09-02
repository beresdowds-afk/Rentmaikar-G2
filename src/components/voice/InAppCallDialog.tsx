import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Bluetooth,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useVoiceDevice } from "@/hooks/useVoiceDevice";
import { useRegion } from "@/contexts/RegionContext";
import { usePublishedCompanyInfo } from "@/hooks/usePublishedCompanyInfo";
import { AudioDiagnosticsPanel } from "@/components/voice/AudioDiagnosticsPanel";

interface InAppCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `support`, a `+E.164` number, or `client:user_<uuid>` */
  destination?: string;
  title?: string;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  initializing: "Preparing audio…",
  ready: "Ready to call",
  connecting: "Connecting…",
  "on-call": "Connected",
  unavailable: "Unavailable",
};

export function InAppCallDialog({
  open,
  onOpenChange,
  destination = "support",
  title,
}: InAppCallDialogProps) {
  const { country } = useRegion();
  const { infoFor } = usePublishedCompanyInfo();
  const {
    status,
    error,
    isMuted,
    micPermission,
    permissionBlocked,
    isSpeakerphone,
    outputLabel,
    startCall,
    hangUp,
    toggleMute,
    toggleSpeakerphone,
    selectOutputRoute,
    preferences,
    setAutoSwitchToHeadset,
    headsetConnected,
    reinitializeAudio,
    initialize,
  } = useVoiceDevice();
  const [started, setStarted] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (open) void initialize();
  }, [open, initialize]);

  useEffect(() => {
    if (!open && started) {
      hangUp();
      setStarted(false);
    }
  }, [open, started, hangUp]);

  const active = status === "connecting" || status === "on-call";

  const handleCall = async () => {
    setStarted(true);
    const ok = await startCall(destination, { Region: country });
    if (!ok) setStarted(false);
  };

  const handleRetry = async () => {
    setRetrying(true);
    await reinitializeAudio();
    setRetrying(false);
  };

  const supportPhone = infoFor(country)?.phoneRaw || infoFor(country)?.phone || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {title ?? "Call support"}
          </DialogTitle>
          <DialogDescription>
            Audio runs inside the app over your internet connection. No personal numbers are shared.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{country}</Badge>
            <span className="text-sm text-muted-foreground">
              {STATUS_LABEL[status] ?? status}
            </span>
            <span className="text-xs text-muted-foreground">· Output: {outputLabel}</span>
          </div>

          {permissionBlocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {micPermission === "unsupported"
                  ? "This browser can't use in-app calling"
                  : "Microphone access is blocked"}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-sm">
                  {micPermission === "unsupported"
                    ? "Your browser does not support microphone access needed for in-app calls."
                    : "Allow the microphone for this site in your browser settings (tap the lock or camera icon in the address bar), then retry."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={handleRetry} disabled={retrying}>
                    {retrying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Retry audio setup
                  </Button>
                  {supportPhone && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`tel:${supportPhone}`}>
                        <Phone className="mr-2 h-4 w-4" />
                        Call on your phone instead
                      </a>
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!permissionBlocked && micPermission === "prompt" && (
            <Alert>
              <Mic className="h-4 w-4" />
              <AlertTitle>Microphone needed</AlertTitle>
              <AlertDescription className="text-sm">
                Your browser will ask for microphone access when the call starts. Choose “Allow” so
                the other side can hear you.
              </AlertDescription>
            </Alert>
          )}

          {error && !permissionBlocked && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="ghost" onClick={handleRetry} disabled={retrying}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}

          {active && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void selectOutputRoute("bluetooth")}>
                <Bluetooth className="mr-2 h-4 w-4" />
                Bluetooth
              </Button>
              <Button variant="outline" size="sm" onClick={() => void selectOutputRoute("earpiece")}>
                <VolumeX className="mr-2 h-4 w-4" />
                Earpiece
              </Button>
            </div>
          )}

          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Auto-switch to headset
              {headsetConnected ? " · headset connected" : ""}
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={preferences.autoSwitchToHeadset}
              onChange={(e) => setAutoSwitchToHeadset(e.target.checked)}
            />
          </label>

          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setShowDiagnostics((v) => !v)}
          >
            {showDiagnostics ? "Hide" : "Show"} audio diagnostics
          </Button>
          {showDiagnostics && <AudioDiagnosticsPanel />}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {active ? (
            <>
              <Button variant="outline" onClick={toggleMute}>
                {isMuted ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                {isMuted ? "Unmute" : "Mute"}
              </Button>
              <Button
                variant={isSpeakerphone ? "secondary" : "outline"}
                onClick={() => void toggleSpeakerphone()}
              >
                <Volume2 className="h-4 w-4 mr-2" />
                {isSpeakerphone ? "Speaker on" : "Speaker off"}
              </Button>
              <Button variant="destructive" onClick={() => { hangUp(); setStarted(false); }}>
                <PhoneOff className="h-4 w-4 mr-2" />
                End call
              </Button>
            </>
          ) : (
            <Button
              onClick={handleCall}
              disabled={status === "initializing" || permissionBlocked}
            >
              {status === "initializing" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              Start call
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
