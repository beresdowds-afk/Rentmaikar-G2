import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Wrench, HeartPulse, Clock, MapPin, ShieldAlert, RefreshCw, Car } from "lucide-react";
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
    hint: "Valid for 24 hours. Renewable every 24hrs up to a maximum of 3 times (max 72h), after which a vehicle call-in process is initiated.",
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    description: "Schedule an urgent maintenance stop with the vehicle owner.",
    hint: "Valid for 24 hours. Renewable every 24hrs up to a maximum of 3 times (max 72h), after which a vehicle call-in process is initiated.",
  },
  sick: {
    label: "Driver Sick Call-In",
    icon: HeartPulse,
    description: "You are unable to drive due to illness.",
    hint: "Valid up to 7 days. Extensions require owner consent and admin approval.",
  },
};

export function CallInPanel({ vehicleId, rentalId }: Props) {
  const { activeCallIn, create, cancel, requestExtension, renew } = useCallIns();
  const [openType, setOpenType] = useState<CallInType | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [openRenewDialog, setOpenRenewDialog] = useState(false);
  const [renewalNotes, setRenewalNotes] = useState("");

  const active = activeCallIn.data;

  const submit = async () => {
    const targetVehicleId = vehicleId || "active-rental-vehicle";
    if (reason.trim().length < 3) return toast.error("Please describe the reason (min 3 chars).");
    if (!openType) return;

    setGpsLoading(true);
    try {
      let coords = { lat: 6.5244, lng: 3.3792 };
      try {
        if (navigator.geolocation) {
          coords = await new Promise<{ lat: number; lng: number }>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => resolve({ lat: 6.5244, lng: 3.3792 }),
              { enableHighAccuracy: true, timeout: 5000 },
            );
          });
        }
      } catch {
        // use fallback coords
      }
      await create.mutateAsync({
        type: openType,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        vehicle_id: targetVehicleId,
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

  const handleRenew = async () => {
    if (!active) return;
    try {
      await renew.mutateAsync({
        id: active.id,
        notes: renewalNotes.trim() || undefined,
      });
      setOpenRenewDialog(false);
      setRenewalNotes("");
    } catch (e) {
      // Handled in mutation onError
    }
  };

  if (active) {
    const expires = new Date(active.expires_at);
    const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3600000));
    const isFaultOrMaint = active.type === "fault" || active.type === "maintenance";
    const renewalCount = active.renewal_count ?? 0;
    const maxRenewals = active.max_renewals ?? 3;
    const canRenew = isFaultOrMaint && renewalCount < maxRenewals && !active.recall_initiated;
    const maxReachedOrRecalled = (renewalCount >= maxRenewals) || active.recall_initiated;

    return (
      <>
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
              <div className="flex items-center gap-2">
                {isFaultOrMaint && (
                  <Badge variant={maxReachedOrRecalled ? "destructive" : "secondary"}>
                    Renewal {renewalCount} / {maxRenewals}
                  </Badge>
                )}
                <Badge variant="secondary">{active.status}</Badge>
              </div>
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

            {/* Vehicle Call-In / Recall Initiated Banner */}
            {maxReachedOrRecalled && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                <Car className="h-4 w-4 text-destructive" />
                <AlertTitle className="font-semibold text-destructive">Vehicle Call-In Process Initiated</AlertTitle>
                <AlertDescription className="text-xs text-destructive/90 space-y-1 mt-1">
                  <p>
                    This {active.type} call-in has reached the maximum of 3 renewals (72 hours grounded).
                    A mandatory vehicle call-in process has been initiated.
                  </p>
                  <p>
                    Please coordinate with the fleet administrator and vehicle owner to arrange inspection,
                    workshop handover, or vehicle return.
                  </p>
                  {active.recall_id && (
                    <p className="text-[11px] font-mono opacity-80 pt-1">
                      Recall Reference: {active.recall_id.slice(0, 8)}...
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => cancel.mutate(active.id)}>
                Cancel Call-In
              </Button>

              {/* Renewal button for fault / maintenance */}
              {canRenew && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setOpenRenewDialog(true)}
                  disabled={renew.isPending}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${renew.isPending ? "animate-spin" : ""}`} />
                  Renew Call-In (+24h)
                </Button>
              )}

              {active.type === "sick" && !active.extend_requested && (
                <Button variant="secondary" size="sm" onClick={() => requestExtension.mutate(active.id)}>
                  Request Extension (7d cap)
                </Button>
              )}
              {active.extend_requested && (
                <Badge variant="outline">Extension pending owner + admin approval</Badge>
              )}
            </div>

            {isFaultOrMaint && !maxReachedOrRecalled && (
              <p className="text-[11px] text-muted-foreground">
                * Fault/maintenance call-ins are renewable every 24hrs up to 3 times ({maxRenewals - renewalCount} renewal{maxRenewals - renewalCount === 1 ? "" : "s"} remaining). After 3 renewals, a mandatory vehicle call-in process is initiated.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 24-Hour Renewal Confirmation Dialog */}
        <Dialog open={openRenewDialog} onOpenChange={setOpenRenewDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Renew Call-In for 24 Hours
              </DialogTitle>
              <DialogDescription>
                Renewing your {active.type} call-in extends payment suspension and vehicle geofencing by +24 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-muted/60 p-3 text-xs space-y-1">
                <div className="flex justify-between font-medium">
                  <span>Current Renewal Progress:</span>
                  <span>{renewalCount} of {maxRenewals} Used</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Next Renewal:</span>
                  <span>Renewal #{renewalCount + 1}</span>
                </div>
              </div>

              {renewalCount + 1 >= maxRenewals && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-xs font-semibold">Final Renewal Warning</AlertTitle>
                  <AlertDescription className="text-xs">
                    This is your 3rd and final 24h renewal. As mandated by fleet policy, granting this 3rd renewal
                    will immediately initiate the formal vehicle call-in process for workshop return/inspection.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="renewalNotes">Reason / Progress Notes (Optional)</Label>
                <Textarea
                  id="renewalNotes"
                  value={renewalNotes}
                  onChange={(e) => setRenewalNotes(e.target.value)}
                  placeholder="e.g. Awaiting replacement parts from vendor; vehicle still undergoing repair at workshop"
                  maxLength={1000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenRenewDialog(false)} disabled={renew.isPending}>
                Cancel
              </Button>
              <Button onClick={handleRenew} disabled={renew.isPending}>
                {renew.isPending ? "Renewing…" : `Confirm 24h Renewal (${renewalCount + 1}/${maxRenewals})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
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
                paused until the call-in ends or the geofence is breached. Fault/maintenance call-ins
                can be renewed every 24hrs up to 3 times before initiating a vehicle call-in.
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
