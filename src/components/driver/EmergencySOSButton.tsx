import React, { useState, useEffect, useRef } from "react";
import { AlertOctagon, X, PhoneCall, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EmergencySOSButtonProps {
  vehicleId?: string;
  className?: string;
}

export const EmergencySOSButton: React.FC<EmergencySOSButtonProps> = ({ vehicleId, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispatchedId, setDispatchedId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown handler
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      timerRef.current = setTimeout(() => {
        setCountdown((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (countdown === 0) {
      triggerDispatch();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [countdown]);

  const handleStartSOS = () => {
    setDispatchedId(null);
    setIsOpen(true);
    setCountdown(3);
  };

  const handleCancelSOS = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCountdown(null);
    setIsOpen(false);
    toast.info("Emergency SOS trigger cancelled");
  };

  const triggerDispatch = async () => {
    setIsSubmitting(true);
    setCountdown(null);

    let lat: number | null = null;
    let lng: number | null = null;
    let acc: number | null = null;

    // Capture GPS location if available
    try {
      if ("geolocation" in navigator) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        acc = pos.coords.accuracy;
      }
    } catch (geoErr) {
      console.warn("[EmergencySOS] Geolocation acquisition failed, proceeding with dispatch:", geoErr);
    }

    try {
      const { data, error } = await supabase.functions.invoke("emergency-sos", {
        body: {
          latitude: lat,
          longitude: lng,
          accuracy_m: acc,
          vehicle_id: vehicleId || null,
          trigger_source: "driver_button",
          notes: "Driver triggered authenticated one-tap in-app emergency SOS button",
        },
      });

      if (error) throw error;

      setDispatchedId(data?.sos_id || "dispatched");
      toast.error("🚨 EMERGENCY DISPATCH TRANSMITTED", {
        description: "Rentmaikar dispatch center and emergency support have received your GPS coordinates.",
        duration: 10000,
      });
    } catch (err: any) {
      console.error("[EmergencySOS] Dispatch failure, attempting direct RPC fallback:", err);
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("trigger_emergency_sos", {
          _latitude: lat,
          _longitude: lng,
          _accuracy_m: acc,
          _trigger_source: "driver_button",
          _vehicle_id: vehicleId || null,
        });
        if (rpcErr) throw rpcErr;
        setDispatchedId(rpcData?.sos_id || "dispatched");
        toast.error("🚨 EMERGENCY DISPATCH TRANSMITTED (SECURE RPC)");
      } catch (fallbackErr: any) {
        toast.error("Failed to connect to dispatch. Please call emergency services directly (911 / 112).");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        onClick={handleStartSOS}
        className={`bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-500/30 flex items-center gap-2 ${className}`}
        aria-label="Emergency SOS"
      >
        <AlertOctagon className="h-5 w-5 animate-pulse" />
        <span>EMERGENCY SOS</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md border-red-500/50 bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2 text-xl font-bold">
              <ShieldAlert className="h-6 w-6" />
              Emergency SOS Activation
            </DialogTitle>
            <DialogDescription className="text-sm">
              This initiates an immediate emergency alert with your current GPS coordinates to Rentmaikar Safety Dispatch and local support teams.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            {countdown !== null && countdown > 0 && (
              <div className="space-y-4">
                <div className="relative flex items-center justify-center">
                  <div className="h-28 w-28 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
                  <span className="absolute text-5xl font-black text-red-600">{countdown}</span>
                </div>
                <p className="text-sm font-semibold text-muted-foreground">
                  Dispatching in {countdown} second{countdown > 1 ? "s" : ""}...
                </p>
                <Button variant="outline" size="lg" onClick={handleCancelSOS} className="gap-2 border-red-500/40 text-foreground">
                  <X className="h-5 w-5" /> Cancel Emergency Alert
                </Button>
              </div>
            )}

            {isSubmitting && (
              <div className="space-y-3">
                <div className="h-10 w-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-red-600">Transmitting GPS &amp; telemetry to emergency dispatch...</p>
              </div>
            )}

            {dispatchedId && (
              <div className="space-y-4">
                <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto w-fit">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <div>
                  <h4 className="font-bold text-lg text-emerald-600">EMERGENCY DISPATCH ACTIVE</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Event Reference: <span className="font-mono">{dispatchedId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Safety agents have been alerted with your live location. If you are in immediate personal danger, also call your regional emergency number:
                  </p>
                </div>
                <div className="flex gap-2 justify-center">
                  <a href="tel:911" className="inline-flex">
                    <Button variant="destructive" size="sm" className="gap-2">
                      <PhoneCall className="h-4 w-4" /> Call 911 (USA)
                    </Button>
                  </a>
                  <a href="tel:112" className="inline-flex">
                    <Button variant="destructive" size="sm" className="gap-2">
                      <PhoneCall className="h-4 w-4" /> Call 112 (Nigeria)
                    </Button>
                  </a>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsOpen(false)} className="w-full text-xs">
                  Close Window
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
