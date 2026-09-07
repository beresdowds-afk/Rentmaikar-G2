import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Car,
  FileText,
  MapPin,
  Calendar,
  Cpu,
  Radio,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface VehicleAsset {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  color: string | null;
  status: string | null;
  owner_id: string;
  pickup_city?: string | null;
  pickup_address?: string | null;
  gps_tracking_enabled?: boolean;
  is_public?: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface LinkedHardware {
  device: {
    id: string;
    serial_number: string;
    imei: string | null;
    device_model: string | null;
    battery_level: number | null;
    status: string | null;
    last_ping: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  sim: {
    id: string;
    iccid: string;
    msisdn: string | null;
    provider: string;
    status: string;
    data_usage_mb: number | null;
  } | null;
}

interface AssetDetailsDialogProps {
  vehicle: VehicleAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  onViewLocation?: (vehicle: VehicleAsset) => void;
}

export function AssetDetailsDialog({
  vehicle,
  open,
  onOpenChange,
  onUpdate,
  onViewLocation,
}: AssetDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [hardware, setHardware] = useState<LinkedHardware>({ device: null, sim: null });
  const [status, setStatus] = useState<string>(vehicle?.status || "pending");
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(vehicle?.gps_tracking_enabled ?? true);
  const [isPublic, setIsPublic] = useState<boolean>(vehicle?.is_public ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vehicle || !open) return;
    setStatus(vehicle.status || "pending");
    setGpsEnabled(vehicle.gps_tracking_enabled ?? true);
    setIsPublic(vehicle.is_public ?? true);

    void (async () => {
      setLoading(true);
      try {
        const { data: dev } = await supabase
          .from("iot_devices")
          .select("id, serial_number, imei, device_model, battery_level, status, last_ping, latitude, longitude")
          .eq("vehicle_id", vehicle.id)
          .maybeSingle();

        let sim = null;
        if (dev) {
          const { data: simData } = await supabase
            .from("iot_sim_cards")
            .select("id, iccid, msisdn, provider, status, data_usage_mb")
            .eq("device_id", dev.id)
            .maybeSingle();
          sim = simData;
        }

        setHardware({ device: dev, sim });
      } catch (e) {
        console.error("Failed to load vehicle hardware info", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [vehicle, open]);

  if (!vehicle) return null;

  const handleSaveStatus = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({
          status,
          gps_tracking_enabled: gpsEnabled,
          is_public: isPublic,
          updated_at: new Date().toISOString(),
        })
        .eq("id", vehicle.id);

      if (error) throw error;

      toast.success("Asset specifications updated successfully");
      onUpdate();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Failed to update asset", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const unlinkDevice = async () => {
    if (!hardware.device) return;
    try {
      await supabase
        .from("iot_devices")
        .update({ vehicle_id: null, is_linked: false })
        .eq("id", hardware.device.id);

      toast.success("GPS Tracker unlinked from vehicle");
      setHardware((prev) => ({ ...prev, device: null }));
      onUpdate();
    } catch (err: unknown) {
      toast.error("Failed to unlink tracker", { description: (err as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Car className="h-5 w-5 text-primary" />
              {vehicle.year} {vehicle.make} {vehicle.model}
            </DialogTitle>
            <Badge variant="outline" className="capitalize text-xs font-semibold">
              {status}
            </Badge>
          </div>
          <DialogDescription>
            Plate: <span className="font-mono font-bold text-foreground">{vehicle.license_plate}</span>
            {vehicle.vin && ` · VIN: ${vehicle.vin}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* General specs */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg text-xs">
            <div>
              <span className="text-muted-foreground">Color:</span>{" "}
              <span className="font-medium capitalize">{vehicle.color || "Standard"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pickup City:</span>{" "}
              <span className="font-medium">{vehicle.pickup_city || "DMV Central"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Registered:</span>{" "}
              <span className="font-medium">
                {vehicle.created_at ? format(new Date(vehicle.created_at), "MMM d, yyyy") : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Asset ID:</span>{" "}
              <span className="font-mono">{vehicle.id.slice(0, 8)}...</span>
            </div>
          </div>

          {/* IoT Telemetry & Hardware Card */}
          <div className="border rounded-lg p-3.5 space-y-3 bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Cpu className="h-4 w-4 text-primary" />
                Linked IoT Hardware & Telemetry
              </div>
              {hardware.device && onViewLocation && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    onOpenChange(false);
                    onViewLocation(vehicle);
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 text-red-500" />
                  View on Map
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching linked sensors...
              </div>
            ) : hardware.device ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between bg-muted/30 p-2 rounded">
                  <div>
                    <div className="font-medium flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5 text-emerald-500" />
                      {hardware.device.serial_number} ({hardware.device.device_model || "GPS"})
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      IMEI: {hardware.device.imei || "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-destructive hover:text-destructive"
                    onClick={unlinkDevice}
                  >
                    Unlink
                  </Button>
                </div>

                {hardware.sim && (
                  <div className="p-2 border rounded text-[11px] space-y-1">
                    <div className="font-medium text-foreground flex items-center justify-between">
                      <span>SIM: {hardware.sim.iccid}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {hardware.sim.provider}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      MSISDN: {hardware.sim.msisdn || "—"} · Data Used:{" "}
                      {(hardware.sim.data_usage_mb || 0).toFixed(1)} MB
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-1 flex items-center justify-between">
                <span>No IoT GPS tracker currently assigned to this vehicle.</span>
              </div>
            )}
          </div>

          {/* Operational Controls */}
          <div className="space-y-3 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="editStatus">Change Operational Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="editStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active & Available</SelectItem>
                  <SelectItem value="pending">Pending Inspection</SelectItem>
                  <SelectItem value="maintenance">In Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive / Decommissioned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <div>
                <div className="text-xs font-medium">GPS Tracking Active</div>
                <div className="text-[11px] text-muted-foreground">
                  Stream telemetry coordinates into real-time tracking engine
                </div>
              </div>
              <Switch checked={gpsEnabled} onCheckedChange={setGpsEnabled} />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <div>
                <div className="text-xs font-medium">Public Catalogue Visible</div>
                <div className="text-[11px] text-muted-foreground">
                  Display in driver rental catalogue
                </div>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSaveStatus} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssetDetailsDialog;
