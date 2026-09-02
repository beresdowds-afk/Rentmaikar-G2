import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Wrench, HeartPulse, Clock, MapPin, ShieldAlert } from "lucide-react";
import { useCallIns, type CallInType } from "@/hooks/useCallIns";
import { toast } from "sonner";

interface Props {
  vehicleId?: string | null;
  rentalId?: string | null;
}

const TYPE_META: Record<CallInType, { label: string; icon: any; description: string; hint: string }> = {
  fault: {
    label: "Vehicle Fault",
    icon: AlertTriangle,
    description: "Report a mechanical or electrical fault preventing safe operation.",
    hint: "Valid for 24 hours. Repeated fault call-ins over 2 consecutive days trigger a recall request.",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    description: "Schedule an urgent maintenance stop with the vehicle owner.",
    hint: "Valid for 24 hours. Repeated maintenance call-ins over 2 consecutive days trigger a recall request.",
  },
  sick: {
    label: "Driver Sick Call-In",
    icon: HeartPulse,
    description: "You are unable to drive due to illness.",
    hint: "Valid up to 7 days. Extensions require owner consent and admin approval.",
  },
};

export function CallInPanel({ vehicleId, rentalId }: Props) {
  const { activeCallIn, create, cancel, requestExtension } = useCallIns();
  const [openType, setOpenType] = useState<CallInType | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const active = activeCallIn.data;

  const submit = async () => {
    if (!vehicleId) return toast.error("No active rental vehicle.");
    if (reason.trim().length < 3) return toast.error("Please describe the reason (min 3 chars).");
    if (!openType) return;

    setGpsLoading(true);
    try {
      const coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(new Error(err.message)),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      });
      await create.mutateAsync({
        type: openType,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        vehicle_id: vehicleId,
        rental_id: rentalId ?? undefined,
        geofence_lat: coords.lat,
        geofence_lng: coords.lng,
        telemetry_snapshot: { source: "driver_dashboard", captured_at: new Date().toISOString(), ...coords },
      });
      setOpenType(null);
      setReason("");
      setNotes("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGpsLoading(false);
    }
  };

  if (active) {
    const expires = new Date(active.expires_at);
    const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3600000));
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Active Call-In · {TYPE_META[active.type as CallInType].label}
              </CardTitle>
              <CardDescription>Payments are paused. 20m geofence is being enforced.</CardDescription>
            </div>
            <Badge variant="secondary">{active.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> ~{hoursLeft}h remaining</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Geofence 20m radius</div>
          </div>
          <Alert>
            <AlertDescription className="text-xs">
              <strong>Reason:</strong> {active.reason}
              {active.notes && <><br /><strong>Notes:</strong> {active.notes}</>}
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => cancel.mutate(active.id)}>
              Cancel Call-In
            </Button>
            {active.type === "sick" && !active.extend_requested && (
              <Button variant="secondary" size="sm" onClick={() => requestExtension.mutate(active.id)}>
                Request Extension (7d cap)
              </Button>
            )}
            {active.extend_requested && (
              <Badge variant="outline">Extension pending owner + admin approval</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Call In</CardTitle>
          <CardDescription>
            Report a fault, schedule maintenance, or log a sick day. Each call-in pauses your payments and
            geofences the vehicle to a 20 m radius; any breach automatically reactivates payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(TYPE_META) as CallInType[]).map((t) => {
            const Icon = TYPE_META[t].icon;
            return (
              <Button
                key={t}
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                onClick={() => setOpenType(t)}
                disabled={!vehicleId}
              >
                <Icon className="h-5 w-5" />
                <span className="font-semibold">{TYPE_META[t].label}</span>
                <span className="text-xs text-muted-foreground text-center whitespace-normal">
                  {TYPE_META[t].description}
                </span>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!openType} onOpenChange={(o) => !o && setOpenType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openType && TYPE_META[openType].label} Call-In</DialogTitle>
            <DialogDescription>{openType && TYPE_META[openType].hint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder={openType === "sick" ? "e.g. Flu, unable to drive today" : "Describe the fault or maintenance need"}
              />
            </div>
            <div>
              <Label htmlFor="notes">Additional notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                placeholder="Optional — symptoms, sounds, error codes, location details…"
              />
            </div>
            <Alert>
              <AlertDescription className="text-xs">
                On submit, your current GPS location becomes the 20 m geofence center. Payments will be
                paused until the call-in ends or the geofence is breached.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenType(null)}>Cancel</Button>
            <Button onClick={submit} disabled={gpsLoading || create.isPending}>
              {gpsLoading ? "Capturing GPS…" : create.isPending ? "Submitting…" : "Submit Call-In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
