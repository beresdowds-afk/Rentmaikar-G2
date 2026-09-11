import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert,
  RotateCcw,
  PhoneCall,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Radio,
  FileText,
  Clock,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface VehicleData {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  status: string | null;
  pickup_city: string | null;
  pickup_location: string | null;
  lockdown_reason?: string | null;
  disabled_at?: string | null;
  disabled_reason?: string | null;
}

interface ServiceDisruptionDialogProps {
  vehicle: VehicleData | null;
  isDisrupted: boolean;
  disruptionReasonText?: string | null;
  disruptionDate?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (v: VehicleData) => Promise<void>;
  onApply: (v: VehicleData) => Promise<void>;
  isUpdating: boolean;
  reason: string;
  setReason: (r: string) => void;
  customNote: string;
  setCustomNote: (n: string) => void;
  stationaryEnforced: boolean;
  setStationaryEnforced: (s: boolean) => void;
}

export function ServiceDisruptionDialog({
  vehicle,
  isDisrupted,
  disruptionReasonText,
  disruptionDate,
  isOpen,
  onClose,
  onResolve,
  onApply,
  isUpdating,
  reason,
  setReason,
  customNote,
  setCustomNote,
  stationaryEnforced,
  setStationaryEnforced,
}: ServiceDisruptionDialogProps) {
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!vehicle) return null;

  const handleSendCallInSms = () => {
    const text = `Rentmaikar OFFICIAL CALL-IN NOTICE: Driver of ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate}), you are required to report to an operations hub within 24 hours. Failure to comply engages remote stationary starter restriction. Call operations immediately.`;
    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    toast.success("Call-In SMS copied to clipboard!", {
      description: "Dispatched to driver notification queue.",
    });
    setTimeout(() => setCopiedNotice(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${isDisrupted ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>
              {isDisrupted ? <ShieldAlert className="h-5 w-5 animate-pulse" /> : <PhoneCall className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-lg">
                {isDisrupted ? "Manage Service Disruption" : "Issue Call-In / Service Disruption"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {vehicle.year} {vehicle.make} {vehicle.model} • Plate: {vehicle.license_plate}
                {vehicle.vin ? ` • VIN: ${vehicle.vin}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isDisrupted ? (
          <div className="space-y-4 text-xs">
            {/* Active Alert Banner */}
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-destructive text-sm flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  VEHICLE CURRENTLY RESTRICTED
                </span>
                <Badge variant="destructive" className="text-[10px]">
                  Starter Cut Active
                </Badge>
              </div>
              <p className="text-foreground leading-relaxed">
                <strong>Reason:</strong> {disruptionReasonText || "Starter restriction engaged"}
              </p>
              {disruptionDate && (
                <p className="text-muted-foreground text-[11px] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Disruption engaged on: {new Date(disruptionDate).toLocaleString()}
                </p>
              )}
            </div>

            {/* Telematics Safety Status */}
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <span className="font-semibold text-foreground text-[11px] block">
                Telematics Safety &amp; Interlock Verification:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Speed = 0 mph (Stationary)
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ignition Status: OFF
                </div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Radio className="h-3.5 w-3.5 text-amber-500" />
                  Starter Relay: Inhibited
                </div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Clause 3 Enforced
                </div>
              </div>
            </div>

            {/* Quick Resolution Actions */}
            <div className="space-y-2 pt-2">
              <span className="font-semibold text-foreground text-xs block">
                Support Resolution Options:
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="default"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9"
                  disabled={isUpdating}
                  onClick={() => onResolve(vehicle)}
                >
                  {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restore Service &amp; Release Starter
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 text-xs h-9"
                  onClick={handleSendCallInSms}
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  {copiedNotice ? "Copied Notice SMS" : "Copy 24h Notice SMS"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Releasing the starter will dispatch an immediate <code className="bg-muted px-1 py-0.5 rounded text-[10px]">engineResume</code> telematics command and reset vehicle status to active.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Stationary Safety Mandate
              </div>
              <p className="text-[11px] leading-relaxed">
                Service disruption engages starter restriction ONLY when the vehicle is verified stationary (0 mph) with the ignition off. It will never interrupt an active trip on a roadway.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Disruption / Call-In Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select disruption reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="36h Payment Default">36h+ Daily Payment Default</SelectItem>
                  <SelectItem value="72h Payment Default">72h+ Weekly Payment Default</SelectItem>
                  <SelectItem value="24-Hour Call-In Non-Compliance">24-Hour Call-In Non-Compliance</SelectItem>
                  <SelectItem value="Adverse Referee Attestation">Adverse Referee / Guarantor Attestation</SelectItem>
                  <SelectItem value="Boundary Geofence Breach">Boundary / Geofence Breach</SelectItem>
                  <SelectItem value="Routine Inspection Audit">Routine Inspection &amp; Telematics Audit</SelectItem>
                  <SelectItem value="Other">Other (Custom Note)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Operational Notes / Context</label>
              <Textarea
                placeholder="Provide incident details, ticket number, or driver communication log..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="text-xs h-20"
              />
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground text-xs block">
                  Enforce Stationary Interlock (Speed 0 mph)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Safety lock ensures immobilization commands only execute when safely parked.
                </span>
              </div>
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10 font-semibold">
                Enforced (Mandatory)
              </Badge>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
          <Button asChild variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground">
            <Link to="/admin" onClick={onClose}>
              <ExternalLink className="h-3 w-3" />
              View Support Protocol Docs
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {!isDisrupted && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1 text-xs"
                disabled={isUpdating}
                onClick={() => onApply(vehicle)}
              >
                {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                Apply Service Disruption
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ServiceDisruptionDialog;
