import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CreditCard as SimIcon,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  MoreVertical,
  Link2,
  Unlink,
  Trash2,
  Edit2,
  Radio,
  Download,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { IoTLivenessCommandBar } from "./IoTLivenessCommandBar";
import { IoTAuditLogFeed } from "./IoTAuditLogFeed";

interface SimCard {
  id: string;
  iccid: string;
  msisdn: string | null;
  imsi: string | null;
  provider: string;
  provider_sim_id: string | null;
  status: string;
  plan_name: string | null;
  data_usage_mb: number | null;
  data_limit_mb: number | null;
  last_session_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  device_id: string | null;
  vehicle_id: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface DeviceOption {
  id: string;
  serial_number: string;
  imei?: string | null;
  provider?: string | null;
  provider_device_id?: string | null;
  device_model: string | null;
  vehicle_id: string | null;
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
}

const PROVIDERS = [
  { id: "hologram", name: "Hologram Global IoT" },
  { id: "mtn_ng", name: "MTN Nigeria (M2M)" },
  { id: "airtel_ng", name: "Airtel Nigeria IoT" },
  { id: "att_us", name: "AT&T Business IoT" },
  { id: "tmobile_us", name: "T-Mobile USA IoT" },
  { id: "glo_ng", name: "Globacom Nigeria" },
  { id: "sarekon", name: "GPSANDTRACK / Sarekon" },
];

export function IoTSimCardsPanel() {
  const [sims, setSims] = useState<SimCard[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // New SIM Provisioning Modal
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newIccid, setNewIccid] = useState("");
  const [newMsisdn, setNewMsisdn] = useState("");
  const [newImsi, setNewImsi] = useState("");
  const [newProvider, setNewProvider] = useState("hologram");
  const [newPlanName, setNewPlanName] = useState("Fleet Standard 250MB");
  const [newDataLimit, setNewDataLimit] = useState("250");
  const [newStatus, setNewStatus] = useState("active");
  const [newDeviceId, setNewDeviceId] = useState("none");
  const [manualDeviceNumber, setManualDeviceNumber] = useState("");
  const [newVehicleId, setNewVehicleId] = useState("none");

  // Edit / Link Modal
  const [editSim, setEditSim] = useState<SimCard | null>(null);
  const [editPlanName, setEditPlanName] = useState("");
  const [editDataLimit, setEditDataLimit] = useState("");
  const [editDeviceId, setEditDeviceId] = useState("none");
  const [editVehicleId, setEditVehicleId] = useState("none");
  const [editModalOpen, setEditModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [simsRes, devRes, vehRes] = await Promise.all([
        supabase
          .from("iot_sim_cards")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("iot_devices")
          .select("id, serial_number, imei, provider, provider_device_id, device_model, vehicle_id"),
        supabase
          .from("vehicles")
          .select("id, make, model, year, license_plate")
          .order("created_at", { ascending: false }),
      ]);

      if (simsRes.data) setSims(simsRes.data as SimCard[]);
      if (devRes.data) setDevices(devRes.data as DeviceOption[]);
      if (vehRes.data) setVehicles(vehRes.data as VehicleOption[]);
    } catch (err: unknown) {
      console.error("Failed loading SIM inventory", err);
      toast.error("Could not load SIM cards");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const stats = useMemo(() => {
    const total = sims.length;
    const active = sims.filter((s) => ["active", "live"].includes((s.status || "").toLowerCase())).length;
    const suspended = sims.filter((s) => ["suspended", "paused"].includes((s.status || "").toLowerCase())).length;
    const unassigned = sims.filter((s) => !s.device_id && !s.vehicle_id).length;
    const totalUsage = sims.reduce((sum, s) => sum + (s.data_usage_mb || 0), 0);
    return { total, active, suspended, unassigned, totalUsage };
  }, [sims]);

  const filteredSims = useMemo(() => {
    return sims.filter((sim) => {
      const matchesSearch =
        !searchQuery ||
        sim.iccid.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sim.msisdn && sim.msisdn.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sim.imsi && sim.imsi.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sim.plan_name && sim.plan_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProvider =
        providerFilter === "all" || sim.provider.toLowerCase() === providerFilter.toLowerCase();

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && ["active", "live"].includes((sim.status || "").toLowerCase())) ||
        (statusFilter === "suspended" && ["suspended", "paused"].includes((sim.status || "").toLowerCase())) ||
        (statusFilter === "inventory" && ["inventory", "pending", "inactive"].includes((sim.status || "").toLowerCase()));

      return matchesSearch && matchesProvider && matchesStatus;
    });
  }, [sims, searchQuery, providerFilter, statusFilter]);

  const handleProvisionSim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIccid.trim()) {
      toast.error("ICCID is required");
      return;
    }

    setSubmitting(true);
    try {
      // Resolve device if manual device number is provided or picked
      let resolvedDeviceId: string | null = newDeviceId !== "none" ? newDeviceId : null;
      let matchedDevice: DeviceOption | null = resolvedDeviceId
        ? devices.find((d) => d.id === resolvedDeviceId) || null
        : null;

      if (!resolvedDeviceId && manualDeviceNumber.trim()) {
        const num = manualDeviceNumber.trim().toLowerCase();
        const found = devices.find(
          (d) =>
            d.serial_number.toLowerCase() === num ||
            (d.imei && d.imei.toLowerCase() === num) ||
            (d.provider_device_id && d.provider_device_id.toLowerCase() === num)
        );
        if (found) {
          resolvedDeviceId = found.id;
          matchedDevice = found;
        } else {
          // Look up in database directly in case it was created recently
          const { data: dbDev } = await supabase
            .from("iot_devices")
            .select("id, serial_number, imei, provider, provider_device_id, device_model, vehicle_id")
            .or(`serial_number.eq.${manualDeviceNumber.trim()},imei.eq.${manualDeviceNumber.trim()},provider_device_id.eq.${manualDeviceNumber.trim()}`)
            .limit(1);
          if (dbDev && dbDev.length > 0) {
            resolvedDeviceId = dbDev[0].id;
            matchedDevice = dbDev[0] as DeviceOption;
          }
        }
      }

      const payload = {
        iccid: newIccid.trim(),
        msisdn: newMsisdn.trim() || null,
        imsi: newImsi.trim() || null,
        provider: newProvider,
        plan_name: newPlanName.trim() || "Standard Telemetry",
        data_limit_mb: Number(newDataLimit) || 250,
        data_usage_mb: 0,
        status: newStatus,
        device_id: resolvedDeviceId,
        vehicle_id: newVehicleId !== "none" ? newVehicleId : matchedDevice?.vehicle_id ?? null,
        activated_at: newStatus === "active" ? new Date().toISOString() : null,
      };

      const { data, error } = await supabase
        .from("iot_sim_cards")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      toast.success("SIM card provisioned successfully", {
        description: `ICCID: ${newIccid.trim()} on ${newProvider}${
          matchedDevice
            ? ` · Linked manually to device ${matchedDevice.serial_number || matchedDevice.provider_device_id}`
            : ""
        }`,
      });

      // Maintain reciprocal link in iot_devices
      if (resolvedDeviceId) {
        await supabase
          .from("iot_devices")
          .update({
            sim_number: newIccid.trim(),
            sim_provider: newProvider,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolvedDeviceId);
      }

      setProvisionOpen(false);
      resetProvisionForm();
      void loadData();
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to provision SIM card", {
        description: (err as Error).message || "Database insert failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetProvisionForm = () => {
    setNewIccid("");
    setNewMsisdn("");
    setNewImsi("");
    setNewProvider("hologram");
    setNewPlanName("Fleet Standard 250MB");
    setNewDataLimit("250");
    setNewStatus("active");
    setNewDeviceId("none");
    setManualDeviceNumber("");
    setNewVehicleId("none");
  };

  const handleToggleStatus = async (sim: SimCard) => {
    const isCurrentlyActive = ["active", "live"].includes((sim.status || "").toLowerCase());
    const nextStatus = isCurrentlyActive ? "suspended" : "active";

    try {
      const { error } = await supabase
        .from("iot_sim_cards")
        .update({
          status: nextStatus,
          suspended_at: nextStatus === "suspended" ? new Date().toISOString() : null,
          activated_at: nextStatus === "active" ? new Date().toISOString() : sim.activated_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sim.id);

      if (error) throw error;

      toast.success(`SIM ${sim.iccid.slice(-6)} set to ${nextStatus.toUpperCase()}`);
      void loadData();
    } catch (err: unknown) {
      toast.error("Failed to change SIM status", { description: (err as Error).message });
    }
  };

  const openEditModal = (sim: SimCard) => {
    setEditSim(sim);
    setEditPlanName(sim.plan_name || "");
    setEditDataLimit(String(sim.data_limit_mb || "250"));
    setEditDeviceId(sim.device_id || "none");
    setEditVehicleId(sim.vehicle_id || "none");
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editSim) return;
    setSubmitting(true);
    try {
      const nextDeviceId = editDeviceId !== "none" ? editDeviceId : null;
      const { error } = await supabase
        .from("iot_sim_cards")
        .update({
          plan_name: editPlanName.trim() || null,
          data_limit_mb: Number(editDataLimit) || null,
          device_id: nextDeviceId,
          vehicle_id: editVehicleId !== "none" ? editVehicleId : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editSim.id);

      if (error) throw error;

      // Keep iot_devices reciprocal fields up-to-date
      if (editSim.device_id && editSim.device_id !== nextDeviceId) {
        // Unlink previous device
        await supabase
          .from("iot_devices")
          .update({ sim_number: null, sim_provider: null, updated_at: new Date().toISOString() })
          .eq("id", editSim.device_id);
      }

      if (nextDeviceId) {
        // Link new device
        await supabase
          .from("iot_devices")
          .update({
            sim_number: editSim.iccid,
            sim_provider: editSim.provider,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextDeviceId);
      }

      toast.success("SIM card configuration updated");
      setEditModalOpen(false);
      void loadData();
    } catch (err: unknown) {
      toast.error("Failed to update SIM", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSim = async (sim: SimCard) => {
    if (!confirm(`Are you sure you want to decommission SIM ${sim.iccid}?`)) return;

    try {
      const { error } = await supabase.from("iot_sim_cards").delete().eq("id", sim.id);
      if (error) throw error;
      toast.success(`SIM ${sim.iccid} deleted`);
      void loadData();
    } catch (err: unknown) {
      toast.error("Failed to delete SIM", { description: (err as Error).message });
    }
  };

  const seedSampleSims = async () => {
    setSubmitting(true);
    try {
      const samples = [
        {
          iccid: `894450${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          msisdn: "+12025550191",
          imsi: "310410123456789",
          provider: "att_us",
          plan_name: "Fleet USA 500MB LTE-M",
          data_limit_mb: 500,
          data_usage_mb: 42.8,
          status: "active",
          last_session_at: new Date().toISOString(),
        },
        {
          iccid: `892340${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          msisdn: "+2348035550123",
          imsi: "621200123456789",
          provider: "mtn_ng",
          plan_name: "MTN Nigeria Telemetry 1GB",
          data_limit_mb: 1024,
          data_usage_mb: 185.3,
          status: "active",
          last_session_at: new Date().toISOString(),
        },
        {
          iccid: `894410${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          msisdn: "+14155550188",
          imsi: "310260123456789",
          provider: "hologram",
          plan_name: "Hologram Global M2M 250MB",
          data_limit_mb: 250,
          data_usage_mb: 12.1,
          status: "active",
          last_session_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          iccid: `892341${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          msisdn: "+2349025550144",
          imsi: "621300123456789",
          provider: "airtel_ng",
          plan_name: "Airtel NG Fleet 500MB",
          data_limit_mb: 500,
          data_usage_mb: 0,
          status: "inventory",
          last_session_at: null,
        },
      ];

      const { error } = await supabase.from("iot_sim_cards").insert(samples);
      if (error) throw error;
      toast.success("Added sample USA & Nigeria IoT SIM cards");
      void loadData();
    } catch (err: unknown) {
      toast.error("Failed to seed SIMs", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const getVehicleLabel = (vehicleId: string | null) => {
    if (!vehicleId) return "—";
    const v = vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.year} ${v.make} ${v.model} (${v.license_plate})` : vehicleId.slice(0, 8);
  };

  const getDeviceLabel = (deviceId: string | null) => {
    if (!deviceId) return "—";
    const d = devices.find((x) => x.id === deviceId);
    if (!d) return deviceId.slice(0, 8);
    const isSarekon =
      d.provider === "sarekon" ||
      d.provider === "gpsandtrack" ||
      (d.device_model || "").toLowerCase().includes("sarekon") ||
      (d.device_model || "").toLowerCase().includes("gpsandtrack");
    const tag = isSarekon ? "[GPSANDTRACK / SAREKON] " : d.provider ? `[${d.provider.toUpperCase()}] ` : "";
    return `${tag}${d.serial_number || d.provider_device_id || d.imei} (${d.device_model || "GPS"})`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Provision Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <SimIcon className="h-5 w-5 text-primary" />
            SIM Card Provisioning & Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage cellular IoT SIM cards across Hologram, MTN, Airtel, AT&T, and T-Mobile.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {sims.length === 0 && (
            <Button variant="outline" size="sm" onClick={seedSampleSims} disabled={submitting}>
              <Sparkles className="h-4 w-4 mr-1.5 text-amber-500" />
              Seed Demo SIMs
            </Button>
          )}
          <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Provision New SIM
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={handleProvisionSim}>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <SimIcon className="h-5 w-5 text-primary" />
                    Provision Cellular IoT SIM Card
                  </DialogTitle>
                  <DialogDescription>
                    Register a new SIM card into your telemetry fleet and optionally link it to a GPS tracker device.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  {/* GPSANDTRACK / SAREKON Directive Banner */}
                  <div className="rounded-md border border-amber-200 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">GPSANDTRACK / SAREKON Manual Mapping Directive</p>
                      <p className="text-muted-foreground">
                        GPS AND TRACK has a direct dependence on SAREKON maps and services. Automatic mapping is disabled for GPSANDTRACK/SAREKON devices. The device number must be manually linked here when SIMs are manually inputted.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="iccid">ICCID (SIM Serial Number) *</Label>
                    <Input
                      id="iccid"
                      placeholder="e.g. 8944501234567890123"
                      value={newIccid}
                      onChange={(e) => setNewIccid(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="msisdn">Phone Number (MSISDN)</Label>
                      <Input
                        id="msisdn"
                        placeholder="e.g. +12025550190 or +234..."
                        value={newMsisdn}
                        onChange={(e) => setNewMsisdn(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="imsi">IMSI (Optional)</Label>
                      <Input
                        id="imsi"
                        placeholder="e.g. 310410..."
                        value={newImsi}
                        onChange={(e) => setNewImsi(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="provider">Carrier / Provider</Label>
                      <Select value={newProvider} onValueChange={setNewProvider}>
                        <SelectTrigger id="provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="status">Initial Status</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active / Operational</SelectItem>
                          <SelectItem value="inventory">In Inventory</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="plan">Data Plan Name</Label>
                      <Input
                        id="plan"
                        value={newPlanName}
                        onChange={(e) => setNewPlanName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="limit">Monthly Data Limit (MB)</Label>
                      <Input
                        id="limit"
                        type="number"
                        value={newDataLimit}
                        onChange={(e) => setNewDataLimit(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="device">Link to Device Number</Label>
                      <Select
                        value={newDeviceId}
                        onValueChange={(val) => {
                          setNewDeviceId(val);
                          if (val !== "none") {
                            const d = devices.find((x) => x.id === val);
                            if (d) setManualDeviceNumber(d.serial_number || d.provider_device_id || d.imei || "");
                          }
                        }}
                      >
                        <SelectTrigger id="device">
                          <SelectValue placeholder="Select device..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Unassigned)</SelectItem>
                          {devices.map((d) => {
                            const isSarekon =
                              d.provider === "sarekon" ||
                              d.provider === "gpsandtrack" ||
                              (d.device_model || "").toLowerCase().includes("sarekon") ||
                              (d.device_model || "").toLowerCase().includes("gpsandtrack");
                            return (
                              <SelectItem key={d.id} value={d.id}>
                                {isSarekon ? "🛰️ [GPSANDTRACK/SAREKON] " : ""}
                                {d.serial_number || d.provider_device_id || d.imei} ({d.device_model || "GPS"})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Or type Device # / Serial / IMEI"
                        value={manualDeviceNumber}
                        onChange={(e) => {
                          setManualDeviceNumber(e.target.value);
                          const matched = devices.find(
                            (d) =>
                              d.serial_number.toLowerCase() === e.target.value.trim().toLowerCase() ||
                              (d.imei && d.imei.toLowerCase() === e.target.value.trim().toLowerCase()) ||
                              (d.provider_device_id && d.provider_device_id.toLowerCase() === e.target.value.trim().toLowerCase())
                          );
                          if (matched) setNewDeviceId(matched.id);
                        }}
                        className="text-xs h-8 mt-1"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="vehicle">Link to Vehicle</Label>
                      <Select value={newVehicleId} onValueChange={setNewVehicleId}>
                        <SelectTrigger id="vehicle">
                          <SelectValue placeholder="Select vehicle..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Unassigned)</SelectItem>
                          {vehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.make} {v.model} ({v.license_plate})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setProvisionOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Provision SIM
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Real-time Liveness & Auto-Enabling Bar */}
      <IoTLivenessCommandBar onRefresh={() => void loadData()} />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-medium">Total SIMs</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Provisioned in database</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-medium text-emerald-600">Active / Live</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.active}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Reporting telemetry</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-medium text-amber-600">Suspended / Paused</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.suspended}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Line dormant</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-medium">Total Usage</div>
          <div className="text-2xl font-bold mt-1">{stats.totalUsage.toFixed(1)} MB</div>
          <div className="text-xs text-muted-foreground mt-0.5">{stats.unassigned} unassigned SIMs</div>
        </Card>
      </div>

      {/* Filter and Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">SIM Card Inventory & Provisioning States</CardTitle>
              <CardDescription>
                Live connectivity, data consumption, device binding, and carrier status.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search ICCID, phone, plan..."
                  className="pl-8 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Carriers</SelectItem>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name.split(" ")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading SIM inventory...
            </div>
          ) : filteredSims.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <SimIcon className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
              <p className="font-medium">No SIM cards matching criteria</p>
              <p className="text-xs mt-1">Click "Provision New SIM" to register your first card.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ICCID / Serial</TableHead>
                  <TableHead>Phone / Carrier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Plan &amp; Usage</TableHead>
                  <TableHead>Linked Tracker / Vehicle</TableHead>
                  <TableHead>Last Ping</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSims.map((sim) => {
                  const isActive = ["active", "live"].includes((sim.status || "").toLowerCase());
                  const usagePercent =
                    sim.data_limit_mb && sim.data_limit_mb > 0
                      ? Math.min(100, Math.round(((sim.data_usage_mb || 0) / sim.data_limit_mb) * 100))
                      : 0;

                  return (
                    <TableRow key={sim.id}>
                      <TableCell>
                        <div className="font-mono text-xs font-semibold">{sim.iccid}</div>
                        {sim.imsi && <div className="text-[10px] text-muted-foreground font-mono">IMSI: {sim.imsi}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{sim.msisdn || "—"}</div>
                        <Badge variant="outline" className="text-[10px] font-normal uppercase">
                          {sim.provider}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isActive ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            Active (Live)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground border-border gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            {sim.status === "suspended" ? "Suspended" : sim.status === "inventory" ? "Inventory" : "Inactive"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{sim.plan_name || "Telemetry Plan"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(sim.data_usage_mb || 0).toFixed(1)} / {sim.data_limit_mb ?? 250} MB ({usagePercent}%)
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{getDeviceLabel(sim.device_id)}</div>
                        <div className="text-[11px] text-muted-foreground">{getVehicleLabel(sim.vehicle_id)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sim.last_session_at ? new Date(sim.last_session_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>SIM Management</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleToggleStatus(sim)}>
                              {isActive ? (
                                <>
                                  <Pause className="h-4 w-4 mr-2 text-amber-600" />
                                  Suspend SIM
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-2 text-emerald-600" />
                                  Activate SIM
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditModal(sim)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Configure / Reassign
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteSim(sim)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Decommission SIM
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Real-Time IoT Audit Stream */}
      <IoTAuditLogFeed title="SIM & Device Auto-Enabling Audit Stream" maxRows={20} />

      {/* Edit / Reassign Configuration Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure SIM Card</DialogTitle>
            <DialogDescription>
              Update data allocation and device/vehicle assignment for ICCID: {editSim?.iccid}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input
                value={editPlanName}
                onChange={(e) => setEditPlanName(e.target.value)}
                placeholder="e.g. M2M 500MB Monthly"
              />
            </div>
            <div className="space-y-2">
              <Label>Data Limit (MB)</Label>
              <Input
                type="number"
                value={editDataLimit}
                onChange={(e) => setEditDataLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Assign to Tracker Device Number</Label>
              <Select value={editDeviceId} onValueChange={setEditDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select device..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {devices.map((d) => {
                    const isSarekon =
                      d.provider === "sarekon" ||
                      d.provider === "gpsandtrack" ||
                      (d.device_model || "").toLowerCase().includes("sarekon") ||
                      (d.device_model || "").toLowerCase().includes("gpsandtrack");
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        {isSarekon ? "🛰️ [GPSANDTRACK / SAREKON] " : ""}
                        {d.serial_number || d.provider_device_id || d.imei} ({d.device_model || "GPS"})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign to Vehicle Asset</Label>
              <Select value={editVehicleId} onValueChange={setEditVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.make} {v.model} ({v.license_plate})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default IoTSimCardsPanel;
