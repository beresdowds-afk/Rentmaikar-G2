import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, RefreshCw, Search, Users, Car } from "lucide-react";
import Seo from "@/components/seo/Seo";
import {
  PROXIMITY_DEFAULT_RADIUS_MILES,
  useProximityMatching,
} from "@/hooks/useProximityMatching";

const formatMiles = (miles: number) => (miles < 0.5 ? "In city" : `${miles.toFixed(1)} mi`);

const AdminProximityMatchingPage = () => {
  const [radius, setRadius] = useState(PROXIMITY_DEFAULT_RADIUS_MILES);
  const [search, setSearch] = useState("");
  const { vehiclesWithDrivers, driversWithVehicles, isLoading, isFetching, refetch, error } =
    useProximityMatching(radius);

  const term = search.trim().toLowerCase();

  const vehicleRows = useMemo(
    () =>
      vehiclesWithDrivers.filter((row) =>
        !term
          ? true
          : [row.vehicle.make, row.vehicle.model, row.location].some((v) =>
              (v ?? "").toLowerCase().includes(term),
            ),
      ),
    [vehiclesWithDrivers, term],
  );

  const driverRows = useMemo(
    () =>
      driversWithVehicles.filter((row) =>
        !term
          ? true
          : [row.driver.full_name, row.driver.email, row.location].some((v) =>
              (v ?? "").toLowerCase().includes(term),
            ),
      ),
    [driversWithVehicles, term],
  );

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <Seo
        path="/admin/proximity-matching"
        title="Vehicle & Driver Proximity Matching | Admin"
        description="Match provisioned, matching-ready vehicles to nearby drivers and drivers to nearby vehicles within a configurable radius, bounded by city limits."
      />


      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Proximity matching</h1>
        <p className="text-muted-foreground text-sm">
          Automatic matches between vehicle pickup locations and driver home addresses. USA matching uses the
          radius below; Nigeria matching is bounded by the city's geographical boundary.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/driver-matching">Open matching pipeline</Link>
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="proximity-search">Search</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                id="proximity-search"
                className="pl-9"
                placeholder="Vehicle, driver or city"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="w-full space-y-2 sm:w-40">
            <Label htmlFor="proximity-radius">Radius (miles)</Label>
            <Input
              id="proximity-radius"
              type="number"
              min={1}
              max={200}
              value={radius}
              onChange={(e) => setRadius(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="text-destructive pt-6 text-sm">
            Could not load matching data: {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="vehicles">
        <TabsList>
          <TabsTrigger value="vehicles">
            <Car className="mr-2 h-4 w-4" /> Vehicles → nearby drivers
          </TabsTrigger>
          <TabsTrigger value="drivers">
            <Users className="mr-2 h-4 w-4" /> Drivers → nearby vehicles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Drivers within {radius} miles of each pickup location</CardTitle>
              <CardDescription>{vehicleRows.length} provisioned vehicles (ready for matching)</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Pickup location</TableHead>
                      <TableHead>Matches</TableHead>
                      <TableHead>Nearby drivers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleRows.map((row) => (
                      <TableRow key={row.vehicle.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {[row.vehicle.year, row.vehicle.make, row.vehicle.model].filter(Boolean).join(" ") ||
                            "Vehicle"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {row.location ?? "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.drivers.length ? "default" : "secondary"}>
                            {row.drivers.length}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.drivers.length ? (
                            <div className="flex flex-wrap gap-2">
                              {row.drivers.slice(0, 8).map((m) => (
                                <Badge key={m.item.user_id} variant="outline">
                                  {m.item.full_name ?? m.item.email ?? "Driver"} · {formatMiles(m.distanceMiles)}
                                </Badge>
                              ))}
                              {row.drivers.length > 8 ? (
                                <Badge variant="secondary">+{row.drivers.length - 8} more</Badge>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No drivers in range</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!vehicleRows.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground text-center text-sm">
                          No vehicles found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Vehicles within {radius} miles of each driver's address</CardTitle>
              <CardDescription>{driverRows.length} drivers</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Address city</TableHead>
                      <TableHead>Matches</TableHead>
                      <TableHead>Nearby vehicles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverRows.map((row) => (
                      <TableRow key={row.driver.user_id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {row.driver.full_name ?? row.driver.email ?? "Driver"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {row.location ?? "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.vehicles.length ? "default" : "secondary"}>
                            {row.vehicles.length}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.vehicles.length ? (
                            <div className="flex flex-wrap gap-2">
                              {row.vehicles.slice(0, 8).map((m) => (
                                <Badge key={m.item.id} variant="outline">
                                  {[m.item.year, m.item.make, m.item.model].filter(Boolean).join(" ") ||
                                    "Vehicle"}{" "}
                                  · {formatMiles(m.distanceMiles)}
                                </Badge>
                              ))}
                              {row.vehicles.length > 8 ? (
                                <Badge variant="secondary">+{row.vehicles.length - 8} more</Badge>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No vehicles in range</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!driverRows.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground text-center text-sm">
                          No drivers found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminProximityMatchingPage;
