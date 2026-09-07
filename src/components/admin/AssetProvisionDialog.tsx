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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Car, Loader2, CheckCircle2, ShieldCheck, Cpu } from "lucide-react";
import { toast } from "sonner";

interface AssetProvisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface AvailableDevice {
  id: string;
  serial_number: string;
  imei: string | null;
  device_model: string | null;
}

export function AssetProvisionDialog({
  open,
  onOpenChange,
  onSuccess,
}: AssetProvisionDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);

  // Form Fields
  const [make, setMake] = useState("Toyota");
  const [model, setModel] = useState("Camry");
  const [year, setYear] = useState("2021");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState("Silver");
  const [pickupCity, setPickupCity] = useState("Washington, DC");
  const [pickupAddress, setPickupAddress] = useState("DMV Central Hub");
  const [status, setStatus] = useState("active");
  const [isPublic, setIsPublic] = useState(true);
  const [gpsTrackingEnabled, setGpsTrackingEnabled] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState("none");

  useEffect(() => {
    if (!open) return;
    // Load unlinked IoT devices
    void (async () => {
      const { data } = await supabase
        .from("iot_devices")
        .select("id, serial_number, imei, device_model")
        .is("vehicle_id", null);
      setAvailableDevices((data as AvailableDevice[]) || []);
    })();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!make.trim() || !model.trim() || !licensePlate.trim()) {
      toast.error("Make, Model, and License Plate are required");
      return;
    }

    setSubmitting(true);
    try {
      // Fetch or assign current user as owner/registrar
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const vehicleId = crypto.randomUUID();

      const newVehicle = {
        id: vehicleId,
        make: make.trim(),
        model: model.trim(),
        year: Number(year) || 2021,
        license_plate: licensePlate.trim().toUpperCase(),
        vin: vin.trim().toUpperCase() || null,
        color: color.trim() || "Black",
        status: status,
        pickup_city: pickupCity.trim(),
        pickup_address: pickupAddress.trim(),
        pickup_location: `${pickupCity.trim()} · ${pickupAddress.trim()}`,
        gps_tracking_enabled: gpsTrackingEnabled,
        is_public: isPublic,
        review_status: "approved",
        submitted_at: new Date().toISOString(),
        published_at: isPublic ? new Date().toISOString() : null,
        owner_id: user?.id || "00000000-0000-0000-0000-000000000000",
        photo_urls: [],
      };

      const { error: vehError } = await supabase.from("vehicles").insert([newVehicle]);
      if (vehError) throw vehError;

      // Link device if chosen
      if (selectedDeviceId !== "none") {
        await supabase
          .from("iot_devices")
          .update({
            vehicle_id: vehicleId,
            is_linked: true,
            installation_status: "active",
            telemetry_enabled: true,
          })
          .eq("id", selectedDeviceId);
      }

      toast.success("Vehicle asset provisioned successfully", {
        description: `${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (${newVehicle.license_plate})`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to provision asset", {
        description: (err as Error).message || "Database insert error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              Provision New Fleet Vehicle Asset
            </DialogTitle>
            <DialogDescription>
              Register a vehicle asset into the platform, establish GPS tracking, and publish to the fleet catalogue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="make">Make *</Label>
                <Input
                  id="make"
                  placeholder="e.g. Toyota"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  placeholder="e.g. Camry"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="year">Year *</Label>
                <Input
                  id="year"
                  type="number"
                  placeholder="2022"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="plate">License Plate *</Label>
                <Input
                  id="plate"
                  placeholder="e.g. ABC-1234 or KJA-948-AB"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vin">VIN (17 characters)</Label>
                <Input
                  id="vin"
                  placeholder="e.g. 4T1B11HK5MU..."
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="color">Exterior Color</Label>
                <Input
                  id="color"
                  placeholder="e.g. Midnight Black"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="status">Operational Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active & Available</SelectItem>
                    <SelectItem value="pending">Pending Inspection</SelectItem>
                    <SelectItem value="maintenance">In Maintenance</SelectItem>
                    <SelectItem value="inactive">Inactive / Stored</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="city">Pickup City & Region</Label>
                <Select value={pickupCity} onValueChange={setPickupCity}>
                  <SelectTrigger id="city">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Washington, DC">Washington, DC (DMV USA)</SelectItem>
                    <SelectItem value="Baltimore, MD">Baltimore, MD (USA)</SelectItem>
                    <SelectItem value="Northern Virginia">Northern Virginia (USA)</SelectItem>
                    <SelectItem value="Lagos">Lagos (Nigeria)</SelectItem>
                    <SelectItem value="Abuja">Abuja FCT (Nigeria)</SelectItem>
                    <SelectItem value="Port Harcourt">Port Harcourt (Nigeria)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="address">Pickup Hub Address</Label>
                <Input
                  id="address"
                  placeholder="e.g. Hub Lot 4, Airport Rd"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="trackerDevice" className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-primary" />
                Assign IoT GPS Tracker Device
              </Label>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger id="trackerDevice">
                  <SelectValue placeholder="Select available tracker..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign Later (No Tracker)</SelectItem>
                  {availableDevices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.serial_number} — {d.device_model || "GPS Tracker"} {d.imei ? `(IMEI: ${d.imei})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">GPS Tracking & Telemetry</div>
                <div className="text-xs text-muted-foreground">
                  Stream live location, speed, ignition, and geofence alerts
                </div>
              </div>
              <Switch
                checked={gpsTrackingEnabled}
                onCheckedChange={setGpsTrackingEnabled}
              />
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Public Catalogue Listing</div>
                <div className="text-xs text-muted-foreground">
                  Make available for drivers to view and book in the catalogue
                </div>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Provision Asset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AssetProvisionDialog;
