import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  CameraOff,
  QrCode,
  Scan,
  RefreshCw,
  Cpu,
  Car,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Search,
  Plus,
  ArrowRight,
  ExternalLink,
  Volume2,
  VolumeX,
  Flashlight,
  History,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScannedHistoryItem {
  code: string;
  type: string;
  timestamp: string;
  matchedEntity?: {
    type: "device" | "vehicle" | "sim" | "unregistered";
    name?: string;
    id?: string;
  };
}

interface IoTBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVehicle?: (vehicleIdOrPlate: string) => void;
  onHardwareLogged?: () => void;
  vehicles?: Array<{ id: string; make: string; model: string; year: number; license_plate: string; vin?: string | null }>;
}

export function IoTBarcodeScannerDialog({
  open,
  onOpenChange,
  onSelectVehicle,
  onHardwareLogged,
  vehicles = [],
}: IoTBarcodeScannerDialogProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "manual" | "history">("camera");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [history, setHistory] = useState<ScannedHistoryItem[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Matched entities
  const [matchedDevice, setMatchedDevice] = useState<any | null>(null);
  const [matchedVehicle, setMatchedVehicle] = useState<any | null>(null);
  const [matchedSim, setMatchedSim] = useState<any | null>(null);
  const [isUnregistered, setIsUnregistered] = useState(false);

  // New hardware quick-logging form
  const [registering, setRegistering] = useState(false);
  const [newDeviceForm, setNewDeviceForm] = useState({
    serial_number: "",
    imei: "",
    device_model: "GPS-01",
    provider: "sarekon",
    target_vehicle_id: "",
    notes: "",
  });

  // Manual code input
  const [manualCode, setManualCode] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Play audio chime when barcode is recognized
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08); // D6 note

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // Audio context might be restricted before user gesture
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(100);
      } catch {
        // Ignore vibration errors
      }
    }
  };

  // Guess identifier type from string pattern
  const inferIdentifierType = (val: string): "imei" | "iccid" | "vin" | "serial" => {
    const clean = val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (/^\d{15}$/.test(clean)) return "imei";
    if (/^\d{19,20}$/.test(clean) || (clean.startsWith("89") && clean.length >= 18)) return "iccid";
    if (clean.length === 17 && !/[IOQ]/.test(clean)) return "vin";
    return "serial";
  };

  // Handle detection of a code from camera or file or manual
  const handleCodeDetected = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed || trimmed === lastScannedCode && lookupLoading) return;

    playBeep();
    setLastScannedCode(trimmed);
    setLookupLoading(true);
    setMatchedDevice(null);
    setMatchedVehicle(null);
    setMatchedSim(null);
    setIsUnregistered(false);

    const kind = inferIdentifierType(trimmed);

    try {
      // 1. Check iot_devices
      const { data: devices, error: devErr } = await supabase
        .from("iot_devices")
        .select(`
          id, serial_number, imei, device_model, provider, status, is_linked,
          installation_status, telemetry_enabled, vehicle_id, sim_number, last_ping
        `)
        .or(`serial_number.eq.${trimmed},imei.eq.${trimmed},id.eq.${trimmed}`)
        .limit(1);

      if (!devErr && devices && devices.length > 0) {
        const dev = devices[0];
        setMatchedDevice(dev);

        // If device has a vehicle, lookup vehicle
        let linkedVeh = null;
        if (dev.vehicle_id) {
          const { data: vData } = await supabase
            .from("vehicles")
            .select("id, make, model, year, license_plate, vin, status")
            .eq("id", dev.vehicle_id)
            .maybeSingle();
          if (vData) {
            setMatchedVehicle(vData);
            linkedVeh = vData;
          }
        }

        toast.success("IoT Hardware Identified", {
          description: `Found ${dev.device_model || "Tracker"} #${dev.serial_number || dev.imei}${
            linkedVeh ? ` (Assigned to ${linkedVeh.make} ${linkedVeh.model})` : " (Unassigned)"
          }`,
        });

        setHistory((prev) => [
          {
            code: trimmed,
            type: kind,
            timestamp: new Date().toISOString(),
            matchedEntity: {
              type: "device",
              name: `${dev.device_model || "Tracker"} (${dev.serial_number || dev.imei})`,
              id: dev.id,
            },
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 2. Check iot_sim_cards
      const { data: sims } = await supabase
        .from("iot_sim_cards")
        .select("*")
        .or(`iccid.eq.${trimmed},msisdn.eq.${trimmed}`)
        .limit(1);

      if (sims && sims.length > 0) {
        const sim = sims[0];
        setMatchedSim(sim);
        toast.info("IoT SIM Card Identified", {
          description: `ICCID: ${sim.iccid} (${sim.provider || "Hologram"}) - Status: ${sim.status}`,
        });
        setHistory((prev) => [
          {
            code: trimmed,
            type: kind,
            timestamp: new Date().toISOString(),
            matchedEntity: {
              type: "sim",
              name: `SIM ${sim.iccid}`,
              id: sim.id,
            },
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 3. Check vehicles (VIN / plate)
      const { data: vehs } = await supabase
        .from("vehicles")
        .select("id, make, model, year, license_plate, vin, status, gps_tracking_enabled")
        .or(`vin.eq.${trimmed},license_plate.eq.${trimmed}`)
        .limit(1);

      if (vehs && vehs.length > 0) {
        const veh = vehs[0];
        setMatchedVehicle(veh);
        toast.success("Vehicle Asset Identified", {
          description: `${veh.year} ${veh.make} ${veh.model} (${veh.license_plate})`,
        });
        setHistory((prev) => [
          {
            code: trimmed,
            type: kind,
            timestamp: new Date().toISOString(),
            matchedEntity: {
              type: "vehicle",
              name: `${veh.year} ${veh.make} ${veh.model} [${veh.license_plate}]`,
              id: veh.id,
            },
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 4. Hardware not yet in database -> New Incoming Hardware
      setIsUnregistered(true);
      setNewDeviceForm({
        serial_number: kind === "serial" ? trimmed : `SN-${trimmed.slice(-8)}`,
        imei: kind === "imei" ? trimmed : "",
        device_model: kind === "imei" ? "Queclink-GL300" : "GPS-01",
        provider: "sarekon",
        target_vehicle_id: "",
        notes: `Logged via depot barcode scanner on ${new Date().toLocaleDateString()}`,
      });

      toast.warning("Unregistered Hardware Detected", {
        description: `Code: ${trimmed} (${kind.toUpperCase()}). Ready to register into fleet.`,
      });

      setHistory((prev) => [
        {
          code: trimmed,
          type: kind,
          timestamp: new Date().toISOString(),
          matchedEntity: {
            type: "unregistered",
            name: `New hardware (${trimmed})`,
          },
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      toast.error("Lookup error", { description: err.message });
    } finally {
      setLookupLoading(false);
    }
  };

  // Start html5-qrcode scanner
  const startCamera = async () => {
    setCameraError(null);
    const element = document.getElementById("reader");
    if (!element) return;

    try {
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }

      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ];

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.777778,
        formatsToSupport,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleCodeDetected(decodedText);
        },
        () => {
          // Frame error (silently ignore normal non-matching frames)
        }
      );

      setIsScanning(true);

      // Check torch support
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities?.() as any;
        if (capabilities && capabilities.torch) {
          setTorchSupported(true);
        }
      } catch {
        setTorchSupported(false);
      }
    } catch (err: any) {
      console.warn("[Barcode Scanner] Failed to start camera:", err);
      setCameraError(
        err?.message ||
          "Could not access camera. Please allow camera permissions or upload a barcode image."
      );
      setIsScanning(false);
    }
  };

  // Stop scanner
  const stopCamera = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      }
      setIsScanning(false);
      setTorchOn(false);
    }
  };

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !torchSupported) return;
    try {
      const nextTorch = !torchOn;
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e: any) {
      toast.error("Torch error", { description: e.message });
    }
  };

  // Scan from uploaded file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLookupLoading(true);
      const scanner = scannerRef.current || new Html5Qrcode("reader-hidden");
      const result = await scanner.scanFile(file, true);
      handleCodeDetected(result);
    } catch (err: any) {
      toast.error("Could not decode barcode from image", {
        description: "Please ensure the image clearly shows the barcode or QR code.",
      });
    } finally {
      setLookupLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Submit quick registration for new incoming IoT hardware
  const handleRegisterIncomingHardware = async () => {
    if (!newDeviceForm.serial_number && !newDeviceForm.imei) {
      toast.error("Serial Number or IMEI is required");
      return;
    }

    setRegistering(true);
    try {
      // 1. Invoke iot-admin edge function to register the device
      const { data, error } = await supabase.functions.invoke("iot-admin", {
        body: {
          action: "register_device",
          serial_number: newDeviceForm.serial_number.trim(),
          imei: newDeviceForm.imei.trim() || undefined,
          device_model: newDeviceForm.device_model,
          provider: newDeviceForm.provider,
          notes: newDeviceForm.notes || "Logged via barcode scanner",
        },
      });

      if (error || (data && !data.ok)) {
        throw new Error(data?.error || error?.message || "Failed to register device");
      }

      const createdDevice = data.device;

      // 2. If target vehicle selected, link immediately
      if (newDeviceForm.target_vehicle_id && createdDevice?.id) {
        await supabase.functions.invoke("iot-admin", {
          body: {
            action: "link_to_vehicle",
            device_id: createdDevice.id,
            vehicle_id: newDeviceForm.target_vehicle_id,
            force: true,
          },
        });
      }

      toast.success("Incoming IoT Hardware Logged!", {
        description: `Successfully added ${newDeviceForm.device_model} (SN: ${
          newDeviceForm.serial_number
        })${newDeviceForm.target_vehicle_id ? " and linked to vehicle" : ""}.`,
      });

      setIsUnregistered(false);
      setMatchedDevice(createdDevice);
      onHardwareLogged?.();
    } catch (err: any) {
      toast.error("Failed to log hardware", { description: err.message });
    } finally {
      setRegistering(false);
    }
  };

  // Quick link matched device to a vehicle
  const handleLinkDeviceToVehicle = async (vehicleId: string) => {
    if (!matchedDevice?.id || !vehicleId) return;
    try {
      setLookupLoading(true);
      const { data, error } = await supabase.functions.invoke("iot-admin", {
        body: {
          action: "link_to_vehicle",
          device_id: matchedDevice.id,
          vehicle_id: vehicleId,
          force: true,
        },
      });

      if (error || (data && !data.ok)) {
        throw new Error(data?.error || error?.message || "Failed to link device");
      }

      toast.success("Device linked to vehicle successfully");
      setMatchedDevice({ ...matchedDevice, vehicle_id: vehicleId, is_linked: true });
      const foundV = vehicles.find((v) => v.id === vehicleId);
      if (foundV) setMatchedVehicle(foundV);
      onHardwareLogged?.();
    } catch (err: any) {
      toast.error("Linking failed", { description: err.message });
    } finally {
      setLookupLoading(false);
    }
  };

  // Camera start/stop on open
  useEffect(() => {
    if (open && activeTab === "camera") {
      const timer = setTimeout(() => {
        startCamera();
      }, 250);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [open, activeTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Scan className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  IoT Hardware &amp; Vehicle Barcode Scanner
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Scan 1D hardware barcodes or QR codes (IMEI, Serial #, ICCID, VIN) to identify or log incoming inventory.
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Mute audio beep" : "Unmute audio beep"}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 mb-3">
            <TabsTrigger value="camera" className="gap-1 text-xs">
              <Camera className="h-3.5 w-3.5" /> Camera Scanner
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1 text-xs">
              <Search className="h-3.5 w-3.5" /> Manual / File
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 text-xs">
              <History className="h-3.5 w-3.5" /> Recent Scans ({history.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Live Camera Scanner */}
          <TabsContent value="camera" className="space-y-3 mt-0">
            <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video sm:aspect-[16/10] flex items-center justify-center">
              {/* HTML5 QR Code Mount Element */}
              <div id="reader" className="w-full h-full" />
              <div id="reader-hidden" className="hidden" />

              {/* Aiming Reticle / Laser Overlay */}
              {isScanning && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="relative w-64 h-36 border-2 border-primary/70 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary" />
                    <div className="absolute left-2 right-2 top-1/2 h-[1.5px] bg-red-500/80 shadow-[0_0_8px_red] animate-pulse" />
                  </div>
                  <span className="text-[11px] text-white/80 bg-black/60 px-2 py-0.5 rounded mt-2">
                    Align barcode or QR code within the frame
                  </span>
                </div>
              )}

              {/* Camera Error / Permission Notice */}
              {cameraError && (
                <div className="p-4 text-center max-w-sm space-y-2">
                  <CameraOff className="h-8 w-8 text-destructive mx-auto" />
                  <p className="text-xs text-white/90">{cameraError}</p>
                  <Button size="sm" variant="secondary" onClick={startCamera} className="gap-1 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" /> Retry Camera
                  </Button>
                </div>
              )}

              {/* Torch button overlay */}
              {torchSupported && isScanning && (
                <Button
                  size="icon"
                  variant="secondary"
                  className={`absolute top-2 right-2 h-8 w-8 rounded-full ${
                    torchOn ? "bg-amber-400 text-black hover:bg-amber-500" : "bg-black/60 text-white hover:bg-black/80"
                  }`}
                  onClick={toggleTorch}
                  title="Toggle flashlight"
                >
                  <Flashlight className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>Supports Code 128, Code 39, EAN, UPC &amp; QR</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" /> Upload Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </TabsContent>

          {/* TAB 2: Manual Code Input or Image File */}
          <TabsContent value="manual" className="space-y-4 mt-0">
            <Card className="border-border">
              <CardContent className="pt-4 space-y-3">
                <Label className="text-xs font-semibold">Enter Hardware Serial, IMEI, ICCID, or VIN</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 860341058291038 or SN-98124..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode.trim()) {
                        handleCodeDetected(manualCode.trim());
                      }
                    }}
                    className="text-sm font-mono"
                  />
                  <Button
                    size="sm"
                    disabled={!manualCode.trim() || lookupLoading}
                    onClick={() => handleCodeDetected(manualCode.trim())}
                    className="gap-1"
                  >
                    <Search className="h-4 w-4" /> Identify
                  </Button>
                </div>
                <div className="pt-2 border-t flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Have a barcode snapshot or label photo?</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1 text-xs"
                  >
                    <Upload className="h-3.5 w-3.5" /> Choose Barcode Image
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Recent Scans History */}
          <TabsContent value="history" className="space-y-2 mt-0">
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No scans recorded in this session yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/50 text-xs transition"
                  >
                    <div className="space-y-0.5">
                      <div className="font-mono font-medium">{item.code}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.matchedEntity?.name || `Type: ${item.type.toUpperCase()}`} •{" "}
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleCodeDetected(item.code)}
                    >
                      Re-scan
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ------------------------------------------------------------------ */}
        {/* IDENTIFICATION / ACTION PANEL                                      */}
        {/* ------------------------------------------------------------------ */}

        {/* State 1: Matched IoT Device */}
        {matchedDevice && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-semibold text-sm text-emerald-900 dark:text-emerald-300">
                    Known Fleet IoT Tracker
                  </span>
                </div>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 uppercase text-[10px]">
                  {matchedDevice.status || "active"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Model / Provider</span>
                  <span className="font-medium">
                    {matchedDevice.device_model || "Tracker"} ({matchedDevice.provider || "Sarekon"})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Serial Number</span>
                  <span className="font-mono font-medium">{matchedDevice.serial_number || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">IMEI</span>
                  <span className="font-mono font-medium">{matchedDevice.imei || "—"}</span>
                </div>
              </div>

              {/* Linked Vehicle Status */}
              {matchedVehicle ? (
                <div className="p-2.5 rounded-lg bg-background border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs font-semibold">
                        Assigned: {matchedVehicle.year} {matchedVehicle.make} {matchedVehicle.model}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Plate: {matchedVehicle.license_plate} {matchedVehicle.vin ? `• VIN: ${matchedVehicle.vin}` : ""}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => {
                      onSelectVehicle?.(matchedVehicle.license_plate || matchedVehicle.id);
                      onOpenChange(false);
                    }}
                  >
                    <Search className="h-3.5 w-3.5" /> View in Fleet
                  </Button>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Tracker is currently unassigned to any vehicle.
                  </div>
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(val) => handleLinkDeviceToVehicle(val)}>
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue placeholder="Quick link to vehicle..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.year} {v.make} {v.model} ({v.license_plate})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* State 2: Matched Vehicle Directly (e.g. Scanned VIN or Plate Barcode) */}
        {!matchedDevice && matchedVehicle && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">
                    {matchedVehicle.year} {matchedVehicle.make} {matchedVehicle.model}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Plate: {matchedVehicle.license_plate}
                </Badge>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground">
                {matchedVehicle.vin && <div>VIN: <span className="font-mono text-foreground">{matchedVehicle.vin}</span></div>}
                <div>Tracking Status: {matchedVehicle.gps_tracking_enabled ? "Enabled" : "Disabled"}</div>
              </div>

              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1"
                onClick={() => {
                  onSelectVehicle?.(matchedVehicle.license_plate || matchedVehicle.id);
                  onOpenChange(false);
                }}
              >
                <Search className="h-3.5 w-3.5" /> Locate in Vehicle Catalogue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* State 3: Unregistered Hardware (Instant Depot Intake Form) */}
        {isUnregistered && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-xs text-amber-900 dark:text-amber-300">
                  Log Incoming IoT Hardware Intake
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <Label className="text-[11px]">Serial Number *</Label>
                  <Input
                    value={newDeviceForm.serial_number}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, serial_number: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">IMEI</Label>
                  <Input
                    value={newDeviceForm.imei}
                    onChange={(e) => setNewDeviceForm({ ...newDeviceForm, imei: e.target.value })}
                    placeholder="15-digit IMEI"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Device Model</Label>
                  <Select
                    value={newDeviceForm.device_model}
                    onValueChange={(val) => setNewDeviceForm({ ...newDeviceForm, device_model: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GPS-01">GPS-01 (Standard)</SelectItem>
                      <SelectItem value="Queclink-GL300">Queclink GL300</SelectItem>
                      <SelectItem value="Teltonika-FMC130">Teltonika FMC130</SelectItem>
                      <SelectItem value="Sarekon-OBD">Sarekon OBD Tracker</SelectItem>
                      <SelectItem value="Hologram Nova">Hologram Nova Cellular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Provider</Label>
                  <Select
                    value={newDeviceForm.provider}
                    onValueChange={(val) => setNewDeviceForm({ ...newDeviceForm, provider: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sarekon">Sarekon (USA)</SelectItem>
                      <SelectItem value="gpsandtrack">GPSANDTRACK (USA)</SelectItem>
                      <SelectItem value="hologram">Hologram</SelectItem>
                      <SelectItem value="traccar">Traccar (Nigeria)</SelectItem>
                      <SelectItem value="custom">Custom / Direct MQTT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Assign Directly to Vehicle (Optional)</Label>
                <Select
                  value={newDeviceForm.target_vehicle_id}
                  onValueChange={(val) => setNewDeviceForm({ ...newDeviceForm, target_vehicle_id: val })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select target vehicle or leave unassigned..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (Keep unassigned inventory)</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.year} {v.make} {v.model} ({v.license_plate})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                disabled={registering}
                onClick={handleRegisterIncomingHardware}
              >
                <CheckCircle2 className="h-4 w-4" />
                {registering ? "Logging into Registry..." : "Confirm & Register Hardware"}
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
