import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Car, Gauge, Loader2, MapPin, RefreshCw, Signal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVehicleFleetStatus } from '@/hooks/useVehicleFleetStatus';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const stageTone = (stage: string | null) =>
  stage === 'ready' ? 'default' : stage ? 'secondary' : 'outline';

/**
 * Owner-facing vehicle status: which of the owner's vehicles are provisioned,
 * whether a driver is assigned, live telemetry and mileage (daily/monthly).
 */
export default function OwnerVehicleStatusPanel() {
  const { user } = useAuth();
  const { vehicles, mileage, loading, error, refresh } = useVehicleFleetStatus({
    ownerId: user?.id,
  });
  const [tab, setTab] = useState('status');

  const monthly = useMemo(() => {
    const map = new Map<string, { vehicleId: string; driverId: string | null; month: string; miles: number }>();
    mileage.forEach((row) => {
      const month = row.log_date.slice(0, 7);
      const key = `${row.vehicle_id}|${row.driver_id ?? 'unassigned'}|${month}`;
      const entry = map.get(key) ?? {
        vehicleId: row.vehicle_id,
        driverId: row.driver_id,
        month,
        miles: 0,
      };
      entry.miles += Number(row.miles || 0);
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [mileage]);

  const nameOf = (vehicleId: string) => {
    const v = vehicles.find((x) => x.vehicleId === vehicleId);
    return v ? `${v.year ?? ''} ${v.make} ${v.model}`.trim() : vehicleId.slice(0, 8);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading vehicle status…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Car className="h-5 w-5" /> Vehicle Status
          </h2>
          <p className="text-sm text-muted-foreground">
            Provisioned vehicles assigned to you, live telemetry and mileage records.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">Vehicles</TabsTrigger>
          <TabsTrigger value="daily">Daily Mileage</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Mileage</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          {vehicles.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No vehicles yet. Once a vehicle is published and provisioned it appears here.
              </CardContent>
            </Card>
          )}
          {vehicles.map((v) => (
            <Card key={v.vehicleId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {v.year ?? ''} {v.make} {v.model}
                    </CardTitle>
                    <CardDescription>{v.licensePlate ?? 'No plate on file'}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Badge variant={stageTone(v.provisioningStage)}>
                      {v.provisioningStage === 'ready'
                        ? 'Provisioned'
                        : v.provisioningStage
                          ? `Provisioning: ${v.provisioningStage}`
                          : 'Not provisioned'}
                    </Badge>
                    <Badge variant={v.assignedDriverId ? 'default' : 'outline'}>
                      {v.assignedDriverId ? `Driver assigned (${v.matchStatus})` : 'No driver'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" /> Mileage today
                  </p>
                  <p className="font-medium">{v.milesToday.toFixed(1)} mi</p>
                </div>
                <div>
                  <p className="text-muted-foreground">This month</p>
                  <p className="font-medium">{v.milesThisMonth.toFixed(1)} mi</p>
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Signal className="h-3.5 w-3.5" /> Telemetry
                  </p>
                  <p className="font-medium">
                    {v.telemetry?.lastEventAt
                      ? `${v.telemetry.ignition ? 'Ignition on' : 'Ignition off'} · ${Number(
                          v.telemetry.speed ?? 0,
                        ).toFixed(0)} km/h`
                      : 'No signal yet'}
                  </p>
                  {v.telemetry?.lastEventAt && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(v.telemetry.lastEventAt), 'PP p')}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Last location
                  </p>
                  <p className="font-medium break-words">
                    {v.telemetry?.address ??
                      (v.telemetry?.latitude != null
                        ? `${v.telemetry.latitude.toFixed(4)}, ${v.telemetry.longitude?.toFixed(4)}`
                        : 'Unavailable')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mileage.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No mileage recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {mileage.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.log_date}</TableCell>
                      <TableCell>{nameOf(row.vehicle_id)}</TableCell>
                      <TableCell>{row.driver_id ? row.driver_id.slice(0, 8) : '—'}</TableCell>
                      <TableCell className="text-right">{Number(row.miles).toFixed(1)}</TableCell>
                      <TableCell>{row.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No mileage recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {monthly.map((row) => (
                    <TableRow key={`${row.vehicleId}-${row.driverId}-${row.month}`}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{nameOf(row.vehicleId)}</TableCell>
                      <TableCell>{row.driverId ? row.driverId.slice(0, 8) : '—'}</TableCell>
                      <TableCell className="text-right">{row.miles.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
