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
} from "lucide-react";
import { format } from "date-fns";

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
  created_at: string | null;
  updated_at: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-destructive/10 text-destructive border-destructive/20",
};

export const AssetsRegistry = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

    return matchesSearch && matchesStatus;
  });

  const vehicleStats = {
    total: vehicles?.length || 0,
    active: vehicles?.filter((v) => v.status === "active").length || 0,
    pending: vehicles?.filter((v) => v.status === "pending").length || 0,
    inactive: vehicles?.filter((v) => v.status === "inactive").length || 0,
    maintenance: vehicles?.filter((v) => v.status === "maintenance").length || 0,
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
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vehicleStats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vehicleStats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
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
              <p className="text-2xl font-bold">{vehicleStats.maintenance}</p>
              <p className="text-xs text-muted-foreground">Maintenance</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Registry Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Car className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Vehicle Assets Registry</h3>
            <a
              href="/admin/vehicle-catalogue"
              className="ml-2 text-xs text-primary underline underline-offset-2"
            >
              Open searchable catalogue →
            </a>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by make, model, plate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-full sm:w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {filteredVehicles && filteredVehicles.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Car className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ID: {vehicle.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono">{vehicle.license_plate}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {vehicle.vin || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {vehicle.color ? (
                        <div className="flex items-center gap-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{vehicle.color}</span>
                        </div>
                      ) : (
                        "—"
                      )}
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {vehicle.created_at
                          ? format(new Date(vehicle.created_at), "MMM d, yyyy")
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
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
          <div className="text-center py-12">
            <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h4 className="text-lg font-medium mb-2">No vehicles found</h4>
            <p className="text-muted-foreground text-sm">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filter criteria"
                : "No vehicles have been registered yet"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
