import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Car,
  Search,
  Filter,
  RefreshCw,
  Eye,
  MapPin,
  Calendar,
  Palette,
  FileText,
  Loader2,
  AlertCircle,
  Plus,
  Compass,
} from "lucide-react";
import { format } from "date-fns";
import { AssetProvisionDialog } from "./AssetProvisionDialog";
import { AssetDetailsDialog } from "./AssetDetailsDialog";
import { AssetLocationDialog } from "./AssetLocationDialog";
import { Link } from "react-router-dom";

type VehicleStatus = "pending" | "active" | "inactive" | "maintenance";

interface Vehicle {
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

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  inactive: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-destructive/10 text-destructive border-destructive/20",
};

export const AssetsRegistry = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");

  // Modal dialog states
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [locationVehicle, setLocationVehicle] = useState<Vehicle | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);

  const { data: vehicles, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const filteredVehicles = vehicles?.filter((vehicle) => {
    const matchesSearch =
      searchQuery === "" ||
      vehicle.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.license_plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vehicle.vin && vehicle.vin.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" || vehicle.status === statusFilter;

    const matchesRegion =
      regionFilter === "all" ||
      (regionFilter === "usa" &&
        (!vehicle.pickup_city ||
          vehicle.pickup_city.includes("DC") ||
          vehicle.pickup_city.includes("MD") ||
          vehicle.pickup_city.includes("Virginia") ||
          vehicle.pickup_city.includes("Washington"))) ||
      (regionFilter === "nigeria" &&
        vehicle.pickup_city &&
        (vehicle.pickup_city.includes("Lagos") ||
          vehicle.pickup_city.includes("Abuja") ||
          vehicle.pickup_city.includes("Harcourt")));

    return matchesSearch && matchesStatus && matchesRegion;
  });

  const vehicleStats = {
    total: vehicles?.length || 0,
    active: vehicles?.filter((v) => v.status === "active").length || 0,
    pending: vehicles?.filter((v) => v.status === "pending").length || 0,
    inactive: vehicles?.filter((v) => v.status === "inactive").length || 0,
    maintenance: vehicles?.filter((v) => v.status === "maintenance").length || 0,
  };

  const handleOpenDetails = (vehicle: Vehicle) => {
    setDetailsVehicle(vehicle);
    setDetailsOpen(true);
  };

  const handleOpenLocation = (vehicle: Vehicle) => {
    setLocationVehicle(vehicle);
    setLocationOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading assets registry...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center gap-4 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p>Failed to load vehicles. Please try again.</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vehicleStats.total}</p>
              <p className="text-xs text-muted-foreground">Total Assets</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{vehicleStats.active}</p>
              <p className="text-xs text-muted-foreground">Active &amp; Ready</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{vehicleStats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Car className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vehicleStats.inactive}</p>
              <p className="text-xs text-muted-foreground">Inactive</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{vehicleStats.maintenance}</p>
              <p className="text-xs text-muted-foreground">Maintenance</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Registry Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Vehicle Assets Registry</h3>
              <Link
                to="/admin/vehicle-catalogue"
                className="ml-2 text-xs text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Searchable Catalogue →
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provision, configure, and monitor vehicles, plates, IoT bindings, and GPS tracking state.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setProvisionOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Provision New Asset
            </Button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search make, model, license plate, VIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>

            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <Compass className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="usa">USA (DMV)</SelectItem>
                <SelectItem value="nigeria">Nigeria</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Vehicles Table */}
        {filteredVehicles && filteredVehicles.length > 0 ? (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle &amp; Model</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Pickup Hub / City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Car className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p
                            className="font-medium hover:underline cursor-pointer"
                            onClick={() => handleOpenDetails(vehicle)}
                          >
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            ID: {vehicle.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono font-semibold">{vehicle.license_plate}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {vehicle.vin || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <div className="font-medium">{vehicle.pickup_city || "DMV Central"}</div>
                        {vehicle.pickup_address && (
                          <div className="text-muted-foreground truncate max-w-[150px]">
                            {vehicle.pickup_address}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[vehicle.status || "pending"]}
                      >
                        {vehicle.status || "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {vehicle.created_at
                          ? format(new Date(vehicle.created_at), "MMM d, yyyy")
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="View Asset Details & Hardware"
                          onClick={() => handleOpenDetails(vehicle)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                          title="View Live GPS Location & Map"
                          onClick={() => handleOpenLocation(vehicle)}
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h4 className="text-lg font-medium mb-1">No vehicles found</h4>
            <p className="text-muted-foreground text-sm mb-4">
              {searchQuery || statusFilter !== "all" || regionFilter !== "all"
                ? "Try adjusting your search or filter criteria"
                : "No fleet vehicles have been provisioned yet"}
            </p>
            <Button size="sm" onClick={() => setProvisionOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Provision First Vehicle Asset
            </Button>
          </div>
        )}
      </Card>

      {/* Modals */}
      <AssetProvisionDialog
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        onSuccess={() => refetch()}
      />

      <AssetDetailsDialog
        vehicle={detailsVehicle}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdate={() => refetch()}
        onViewLocation={(v) => handleOpenLocation(v)}
      />

      <AssetLocationDialog
        vehicle={locationVehicle}
        open={locationOpen}
        onOpenChange={setLocationOpen}
      />
    </div>
  );
};
