import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import PublicListingPreview from "@/components/catalogue/PublicListingPreview";
import { useRegion } from "@/contexts/RegionContext";
import { useCategoryPrices } from "@/hooks/usePublicVehicles";
import categoryBudget from "@/assets/category-budget.jpg";
import categoryStandard from "@/assets/category-standard.jpg";
import categoryPremium from "@/assets/category-premium.jpg";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Car,
  Search,
  Send,
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Eye,
  Plus,
  Download,
  CameraOff,
} from "lucide-react";

import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface VehicleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  license_plate: string;
  vin: string | null;
  status: string | null;
  pickup_city: string | null;
  pickup_location: string | null;
  owner_id: string;
  is_public: boolean | null;
  photo_urls: string[] | null;
}

const categoryForYear = (year?: number | null): "budget" | "standard" | "premium" => {
  if (!year) return "standard";
  if (year <= 2016) return "budget";
  if (year <= 2020) return "standard";
  return "premium";
};

interface DriverRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface RecommendationRow {
  id: string;
  created_at: string;
  admin_id: string | null;
  target_id: string | null;
  details: any;
}

const inferCountry = (v: VehicleRow): "USA" | "Nigeria" | (string & {}) => {
  const c = (v.pickup_city || v.pickup_location || "").toLowerCase();
  if (/(lagos|abuja|port harcourt|ikeja|lekki|victoria|maitama|garki|wuse|surulere)/.test(c)) return "Nigeria";
  return "USA";
};

const statusColors: Record<string, string> = {
  active: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  inactive: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-destructive/10 text-destructive border-destructive/20",
};

const PAGE_SIZE = 15;

type QuickChip = { id: string; label: string; match: (v: VehicleRow) => boolean };

export const hasVerifiedPhotos = (v: { photo_urls?: string[] | null }) =>
  (v.photo_urls ?? []).some((u) => (u ?? "").trim().length > 0);

const quickChips: QuickChip[] = [
  { id: "usa", label: "🇺🇸 USA", match: (v) => inferCountry(v) === "USA" },
  { id: "ng", label: "🇳🇬 Nigeria", match: (v) => inferCountry(v) === "Nigeria" },
  { id: "active", label: "Active", match: (v) => v.status === "active" },
  { id: "pending", label: "Pending", match: (v) => (v.status || "pending") === "pending" },
  { id: "maintenance", label: "Maintenance", match: (v) => v.status === "maintenance" },
  { id: "no_photos", label: "📷 Missing owner photos", match: (v) => !hasVerifiedPhotos(v) },
  { id: "recent", label: "2020+", match: (v) => v.year >= 2020 },
  { id: "electric", label: "Tesla", match: (v) => v.make?.toLowerCase() === "tesla" },
];


interface Props {
  embedded?: boolean;
}

export default function AdminVehicleCataloguePage({ embedded = false }: Props) {
  const { user } = useAuth();
  const { country, currencySymbol } = useRegion();
  const { data: categoryPrices } = useCategoryPrices(country === "Nigeria" ? "NIGERIA" : "USA");
  const [previewVehicle, setPreviewVehicle] = useState<VehicleRow | null>(null);
  const [savingVisibility, setSavingVisibility] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [makeFilter, setMakeFilter] = useState("");
  const [page, setPage] = useState(1);

  const [recommendVehicle, setRecommendVehicle] = useState<VehicleRow | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyForm = {
    make: "",
    model: "",
    year: String(new Date().getFullYear()),
    color: "",
    license_plate: "",
    vin: "",
    pickup_city: "",
    pickup_location: "",
    owner_id: "",
    is_public: true,
  };
  const [form, setForm] = useState({ ...emptyForm });

  const { data: vehicles, isLoading, refetch: refetchVehicles } = useQuery({
    queryKey: ["admin-catalogue-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year, color, license_plate, vin, status, pickup_city, pickup_location, owner_id, is_public, photo_urls")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VehicleRow[];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["admin-catalogue-drivers"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (rolesErr) throw rolesErr;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as DriverRow[];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });

  const { data: owners } = useQuery({
    queryKey: ["admin-catalogue-owners"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "owner");
      if (rolesErr) throw rolesErr;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as DriverRow[];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });



  const {
    data: recommendations,
    isLoading: recsLoading,
    refetch: refetchRecs,
  } = useQuery({
    queryKey: ["admin-catalogue-recommendations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, created_at, admin_id, target_id, details")
        .eq("action", "vehicle_recommendation")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RecommendationRow[];
    },
  });

  const makes = useMemo(
    () => Array.from(new Set((vehicles ?? []).map((v) => v.make))).sort(),
    [vehicles]
  );

  const filtered = useMemo(() => {
    return (vehicles ?? []).filter((v) => {
      const country = inferCountry(v);
      if (countryFilter !== "all" && country !== countryFilter) return false;
      if (statusFilter !== "all" && (v.status || "pending") !== statusFilter) return false;
      if (makeFilter && v.make !== makeFilter) return false;
      for (const id of activeChips) {
        const chip = quickChips.find((c) => c.id === id);
        if (chip && !chip.match(v)) return false;
      }
      if (q) {
        const hay = `${v.make} ${v.model} ${v.year} ${v.license_plate} ${v.vin ?? ""} ${v.pickup_city ?? ""} ${v.pickup_location ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [vehicles, q, statusFilter, countryFilter, makeFilter, activeChips]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleChip = (id: string) => {
    setPage(1);
    setActiveChips((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearFilters = () => {
    setQ("");
    setActiveChips([]);
    setStatusFilter("all");
    setCountryFilter("all");
    setMakeFilter("");
    setPage(1);
  };

  const photolessVehicles = useMemo(
    () => (vehicles ?? []).filter((v) => !hasVerifiedPhotos(v)),
    [vehicles]
  );

  const exportPhotoless = () => {
    if (!photolessVehicles.length) {
      toast.info("Nothing to export", {
        description: "Every vehicle in the registry has at least one owner-uploaded photo.",
      });
      return;
    }
    const header = [
      "vehicle_id",
      "year",
      "make",
      "model",
      "license_plate",
      "vin",
      "status",
      "is_public",
      "country",
      "pickup_city",
      "pickup_location",
      "owner_id",
    ];
    const esc = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = photolessVehicles.map((v) =>
      [
        v.id,
        v.year,
        v.make,
        v.model,
        v.license_plate,
        v.vin ?? "",
        v.status ?? "",
        v.is_public ? "yes" : "no",
        inferCountry(v),
        v.pickup_city ?? "",
        v.pickup_location ?? "",
        v.owner_id ?? "",
      ]
        .map(esc)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registry-only-vehicles-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${photolessVehicles.length} registry-only vehicle(s)`, {
      description: "These vehicles are hidden from the public catalogue until owners upload photos.",
    });
  };



  const setVisibility = async (v: VehicleRow, isPublic: boolean) => {
    setSavingVisibility(v.id);
    try {
      // Visibility is controlled by is_public only. Never overwrite a real
      // operational status (rented, maintenance, sold...). The only safe
      // promotion is lifting a vehicle out of "inactive" when publishing.
      const patch: { is_public: boolean; status?: string } = { is_public: isPublic };
      if (isPublic && v.status === "inactive") patch.status = "available";
      const { error } = await supabase.from("vehicles").update(patch).eq("id", v.id);
      if (error) throw error;
      toast.success(isPublic ? "Vehicle published" : "Vehicle hidden", {
        description: `${v.year} ${v.make} ${v.model} is now ${isPublic ? "visible" : "hidden"} on the public catalogue.`,
      });
      await refetchVehicles();
    } catch (e: any) {
      toast.error("Could not update visibility", { description: e.message });
    } finally {
      setSavingVisibility(null);
    }
  };

  const bulkSetVisibility = async (isPublic: boolean) => {
    const ids = filtered.map((v) => v.id);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      // Only flip the public flag in bulk — statuses like rented, maintenance
      // or sold must survive a publish/hide sweep.
      const { error } = await supabase.from("vehicles").update({ is_public: isPublic }).in("id", ids);
      if (error) throw error;

      // Vehicles parked as "inactive" would stay invisible after publishing,
      // so promote just those back to "available".
      if (isPublic) {
        const reactivateIds = filtered.filter((v) => v.status === "inactive").map((v) => v.id);
        if (reactivateIds.length) {
          const { error: statusError } = await supabase
            .from("vehicles")
            .update({ status: "available" })
            .in("id", reactivateIds);
          if (statusError) throw statusError;
        }
      }
      toast.success(
        isPublic ? `Published ${ids.length} vehicle${ids.length === 1 ? "" : "s"}` : `Hid ${ids.length} vehicle${ids.length === 1 ? "" : "s"}`,
        { description: "Operational statuses (rented, maintenance, sold) were left unchanged." },
      );
      await refetchVehicles();
    } catch (e: any) {
      toast.error("Bulk update failed", { description: e.message });
    } finally {
      setBulkBusy(false);
    }
  };

  const createVehicle = async () => {
    if (!user) return;
    if (!form.make.trim() || !form.model.trim() || !form.license_plate.trim()) {
      toast.error("Make, model and licence plate are required");
      return;
    }
    const year = Number(form.year);
    if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear() + 1) {
      toast.error("Enter a valid manufacture year");
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("vehicles").insert({
        owner_id: form.owner_id || user.id,
        make: form.make.trim(),
        model: form.model.trim(),
        year,
        color: form.color.trim() || null,
        license_plate: form.license_plate.trim().toUpperCase(),
        vin: form.vin.trim() ? form.vin.trim().toUpperCase() : null,
        pickup_city: form.pickup_city.trim() || null,
        pickup_location: form.pickup_location.trim() || null,
        is_public: form.is_public,
        status: form.is_public ? "available" : "pending",
      });
      if (error) throw error;
      toast.success("Vehicle added", {
        description: form.is_public
          ? "It is now live on the public catalogue."
          : "Saved as hidden — publish it when ready.",
      });
      setAddOpen(false);
      setForm({ ...emptyForm });
      await refetchVehicles();
    } catch (e: any) {
      toast.error("Could not add vehicle", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  const previewPrice = useMemo(() => {
    if (!previewVehicle) return undefined;
    const cat = categoryForYear(previewVehicle.year);
    const row = (categoryPrices ?? []).find((p: any) => p.category === cat);
    return row ? Number(row.price) : undefined;
  }, [previewVehicle, categoryPrices]);

  const handleRecommend = async () => {
    if (!recommendVehicle || !selectedDriverId || !user) return;
    setSubmitting(true);
    try {
      const driver = drivers?.find((d) => d.user_id === selectedDriverId);
      const { error } = await supabase.from("admin_audit_log").insert({
        admin_id: user.id,
        action: "vehicle_recommendation",
        target_table: "vehicles",
        target_id: recommendVehicle.id,
        details: {
          driver_id: selectedDriverId,
          driver_email: driver?.email ?? null,
          driver_name: driver?.full_name ?? null,
          vehicle: `${recommendVehicle.year} ${recommendVehicle.make} ${recommendVehicle.model}`,
          license_plate: recommendVehicle.license_plate,
          note: note || null,
        },
      });
      if (error) throw error;
      toast.success("Recommendation logged", {
        description: `Recommended ${recommendVehicle.make} ${recommendVehicle.model} to ${driver?.full_name || driver?.email}.`,
      });
      setRecommendVehicle(null);
      setSelectedDriverId("");
      setNote("");
      refetchRecs();
    } catch (e: any) {
      toast.error("Failed to send recommendation", { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const vehicleById = useMemo(() => {
    const map = new Map<string, VehicleRow>();
    (vehicles ?? []).forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  const body = (
    <div className={embedded ? "space-y-6" : "container mx-auto px-4 space-y-6"}>
      {!embedded && (
        <div>
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Admin
          </Link>
          <h1 className="text-3xl font-display font-bold mt-2 flex items-center gap-2">
            <Car className="h-7 w-7 text-primary" /> Admin Vehicle Catalogue
          </h1>
          <p className="text-muted-foreground">
            Search the full fleet, apply filters, and recommend vehicles to registered drivers.
          </p>
        </div>
      )}

      <Tabs defaultValue="catalogue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalogue" className="gap-2">
            <Car className="h-4 w-4" /> Catalogue
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-2">
            <Sparkles className="h-4 w-4" /> Recommendations
            {recommendations && recommendations.length > 0 && (
              <Badge variant="secondary" className="ml-1">{recommendations.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Single search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search make, model, year, plate, VIN, or city..."
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>

              {/* Quick filter chips */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
                  Quick filters:
                </span>
                {quickChips.map((chip) => {
                  const active = activeChips.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      onClick={() => toggleChip(chip.id)}
                      className={`text-xs px-3 py-1 rounded-full border transition ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
                {(activeChips.length > 0 ||
                  q ||
                  statusFilter !== "all" ||
                  countryFilter !== "all" ||
                  makeFilter) && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 gap-1">
                    <X className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>

              {/* Advanced dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={countryFilter} onValueChange={(v) => { setCountryFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Nigeria">Nigeria</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={makeFilter || "all"} onValueChange={(v) => { setMakeFilter(v === "all" ? "" : v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Make" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Makes</SelectItem>
                    {makes.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between space-y-0">
              <CardTitle className="text-base">
                {isLoading
                  ? "Loading..."
                  : `${filtered.length} vehicle${filtered.length === 1 ? "" : "s"}`}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
                  <Plus className="h-4 w-4" /> Add vehicle
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy || isLoading || filtered.length === 0}
                  onClick={() => bulkSetVisibility(true)}
                  className="gap-1"
                >
                  {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Publish all ({filtered.length})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={bulkBusy || isLoading || filtered.length === 0}
                  onClick={() => bulkSetVisibility(false)}
                >
                  Hide all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleChip("no_photos")}
                  className="gap-1"
                >
                  <CameraOff className="h-4 w-4" />
                  {activeChips.includes("no_photos") ? "Showing" : "Show"} missing photos ({photolessVehicles.length})
                </Button>
                <Button size="sm" variant="outline" onClick={exportPhotoless} className="gap-1">
                  <Download className="h-4 w-4" /> Export registry-only CSV
                </Button>

                {!isLoading && filtered.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Plate / VIN</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Public</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((v) => {
                          const country = inferCountry(v);
                          return (
                            <TableRow key={v.id}>
                              <TableCell>
                                <div className="font-medium">{v.year} {v.make} {v.model}</div>
                                <div className="text-xs text-muted-foreground capitalize">{v.color || "—"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-mono text-sm">{v.license_plate}</div>
                                <div className="font-mono text-xs text-muted-foreground">{v.vin || "—"}</div>
                              </TableCell>
                              <TableCell>{v.pickup_city || v.pickup_location || "—"}</TableCell>
                              <TableCell>{country}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={statusColors[v.status || "pending"]}>
                                  {v.status || "pending"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={Boolean(v.is_public)}
                                    disabled={savingVisibility === v.id}
                                    onCheckedChange={(checked) => setVisibility(v, checked)}
                                    aria-label="Toggle public visibility"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {v.is_public ? "Listed" : "Hidden"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button size="sm" variant="ghost" className="gap-1" onClick={() => setPreviewVehicle(v)}>
                                  <Eye className="h-3 w-3" /> Preview
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => setRecommendVehicle(v)}>
                                  <Send className="h-3 w-3" /> Recommend
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {!paged.length && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                              No vehicles match these filters.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {filtered.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-xs text-muted-foreground">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" /> Prev
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Next <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Vehicles recommended to drivers
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Live feed from <code className="text-[10px]">admin_audit_log</code> · action
                <code className="text-[10px]"> vehicle_recommendation</code>
              </p>
            </CardHeader>
            <CardContent>
              {recsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !recommendations || recommendations.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No recommendations logged yet. Use the "Recommend" action on any vehicle to start.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>Audit ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recommendations.map((r) => {
                        const d = r.details || {};
                        const v = r.target_id ? vehicleById.get(r.target_id) : null;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">
                                {d.vehicle || (v ? `${v.year} ${v.make} ${v.model}` : "—")}
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {d.license_plate || v?.license_plate || "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{d.driver_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{d.driver_email || "—"}</div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {d.note || <span className="italic">no note</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-[10px] text-muted-foreground">
                                {r.id.slice(0, 8)}
                              </code>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  const previewDialog = (
    <Dialog open={Boolean(previewVehicle)} onOpenChange={(o) => !o && setPreviewVehicle(null)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> Public listing preview
          </DialogTitle>
          <DialogDescription>
            Exactly how anonymous visitors see this vehicle on the catalogue and details page.
          </DialogDescription>
        </DialogHeader>
        {previewVehicle && (
          <div className="space-y-4">
            {!previewVehicle.is_public && (
              <div className="rounded-md border border-warning/30 bg-warning/10 text-warning text-xs p-3">
                This vehicle is currently hidden — the preview shows what would be published once you toggle it public.
              </div>
            )}
            <PublicListingPreview
              vehicle={
                {
                  id: previewVehicle.id,
                  make: previewVehicle.make,
                  model: previewVehicle.model,
                  year: previewVehicle.year,
                  color: previewVehicle.color,
                  status: previewVehicle.status,
                  pickup_city: previewVehicle.pickup_city,
                  pickup_location: previewVehicle.pickup_location,
                  photo_urls: previewVehicle.photo_urls,
                } as any
              }
              price={previewPrice}
              currencySymbol={currencySymbol}
              fallbackImage={
                categoryForYear(previewVehicle.year) === "budget"
                  ? categoryBudget
                  : categoryForYear(previewVehicle.year) === "premium"
                  ? categoryPremium
                  : categoryStandard
              }
            />
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Public visibility</p>
                <p className="text-xs text-muted-foreground">Saved immediately.</p>
              </div>
              <Switch
                checked={Boolean(previewVehicle.is_public)}
                disabled={savingVisibility === previewVehicle.id}
                onCheckedChange={async (checked) => {
                  await setVisibility(previewVehicle, checked);
                  setPreviewVehicle({ ...previewVehicle, is_public: checked });
                }}
              />
            </div>
            <Link
              to={`/vehicle/${previewVehicle.id}`}
              target="_blank"
              className="text-sm text-primary underline underline-offset-4"
            >
              Open the live details page
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  const addDialog = (
    <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm({ ...emptyForm }); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Add vehicle to catalogue
          </DialogTitle>
          <DialogDescription>
            Create a listing and choose whether it is immediately visible to public visitors.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Make *</label>
            <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Toyota" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Model *</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Corolla" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Year *</label>
            <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Colour</label>
            <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Silver" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Licence plate *</label>
            <Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">VIN</label>
            <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Pickup city</label>
            <Input value={form.pickup_city} onChange={(e) => setForm({ ...form, pickup_city: e.target.value })} placeholder="Lagos / Atlanta" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Pickup location</label>
            <Input value={form.pickup_location} onChange={(e) => setForm({ ...form, pickup_location: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Owner</label>
            <Select value={form.owner_id || "self"} onValueChange={(v) => setForm({ ...form, owner_id: v === "self" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Platform (me)</SelectItem>
                {(owners ?? []).map((o) => (
                  <SelectItem key={o.user_id} value={o.user_id}>{o.full_name || o.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Publish immediately</div>
              <div className="text-xs text-muted-foreground">Show this vehicle on the public catalogue.</div>
            </div>
            <Switch checked={form.is_public} onCheckedChange={(c) => setForm({ ...form, is_public: c })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={createVehicle} disabled={creating} className="gap-1">
            {creating && <Loader2 className="h-4 w-4 animate-spin" />} Save vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );



  const dialog = (
    <RecommendDialog
      vehicle={recommendVehicle}
      onClose={() => setRecommendVehicle(null)}
      drivers={drivers ?? []}
      selectedDriverId={selectedDriverId}
      setSelectedDriverId={setSelectedDriverId}
      note={note}
      setNote={setNote}
      submitting={submitting}
      onSubmit={handleRecommend}
    />
  );

  if (embedded) {
    return (
      <>
        {body}
        {dialog}
        {previewDialog}
        {addDialog}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">{body}</main>
      <Footer />
      {dialog}
      {previewDialog}
        {addDialog}
    </div>
  );
}

// Extract dialog so both embedded + standalone modes share it
function RecommendDialog({
  vehicle,
  onClose,
  drivers,
  selectedDriverId,
  setSelectedDriverId,
  note,
  setNote,
  submitting,
  onSubmit,
}: {
  vehicle: VehicleRow | null;
  onClose: () => void;
  drivers: DriverRow[];
  selectedDriverId: string;
  setSelectedDriverId: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={!!vehicle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommend vehicle to driver</DialogTitle>
          <DialogDescription>
            {vehicle && `${vehicle.year} ${vehicle.make} ${vehicle.model} • ${vehicle.license_plate}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Driver</label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger><SelectValue placeholder="Select a registered driver" /></SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.user_id} value={d.user_id}>
                    {d.full_name || d.email || d.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this vehicle is a good match..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!selectedDriverId || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send recommendation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
