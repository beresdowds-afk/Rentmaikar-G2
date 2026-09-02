import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Download, Loader2, MapPin, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Seo from '@/components/seo/Seo';
import { supabase } from '@/integrations/supabase/client';
import { useVehicleFleetStatus } from '@/hooks/useVehicleFleetStatus';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface GeofenceRow {
  id: string;
  vehicle_id: string | null;
  name: string | null;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  active: boolean;
  breached_at: string | null;
  last_distance_m: number | null;
}

const csvEscape = (value: unknown) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (filename: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const body = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function AdminVehicleTelemetryPage() {
  const { toast } = useToast();
  const { vehicles, mileage, loading, error, refresh } = useVehicleFleetStatus({ pollMs: 30000 });
  const [geofences, setGeofences] = useState<GeofenceRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<GeofenceRow>>>({});
  const [newFence, setNewFence] = useState({ vehicle_id: '', name: '', lat: '', lng: '', radius: '500' });
  const [saving, setSaving] = useState(false);

  const loadGeofences = async () => {
    const { data, error: gErr } = await supabase
      .from('vehicle_geofences')
      .select('id, vehicle_id, name, center_lat, center_lng, radius_m, active, breached_at, last_distance_m')
      .order('created_at', { ascending: false });
    if (gErr) {
      toast({ title: 'Could not load geofences', description: gErr.message, variant: 'destructive' });
      return;
    }
    setGeofences((data ?? []) as GeofenceRow[]);
  };

  useEffect(() => {
    void loadGeofences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehicleName = (id: string | null) => {
    if (!id) return '—';
    const v = vehicles.find((x) => x.vehicleId === id);
    return v ? `${v.year ?? ''} ${v.make} ${v.model}`.trim() : id.slice(0, 8);
  };

  const live = useMemo(
    () => vehicles.filter((v) => v.telemetry?.lastEventAt),
    [vehicles],
  );

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; vehicle_id: string; driver_id: string | null; miles: number; days: number }>();
    mileage.forEach((row) => {
      const month = row.log_date.slice(0, 7);
      const key = `${month}|${row.vehicle_id}|${row.driver_id ?? ''}`;
      const entry = map.get(key) ?? { month, vehicle_id: row.vehicle_id, driver_id: row.driver_id, miles: 0, days: 0 };
      entry.miles += Number(row.miles || 0);
      entry.days += 1;
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [mileage]);

  const saveFence = async (fence: GeofenceRow) => {
    const patch = draft[fence.id];
    if (!patch) return;
    setSaving(true);
    const { error: uErr } = await supabase
      .from('vehicle_geofences')
      .update({
        name: patch.name ?? fence.name,
        center_lat: Number(patch.center_lat ?? fence.center_lat),
        center_lng: Number(patch.center_lng ?? fence.center_lng),
        radius_m: Number(patch.radius_m ?? fence.radius_m),
        active: patch.active ?? fence.active,
      })
      .eq('id', fence.id);
    setSaving(false);
    if (uErr) {
      toast({ title: 'Update failed', description: uErr.message, variant: 'destructive' });
      return;
    }
    setDraft((d) => {
      const next = { ...d };
      delete next[fence.id];
      return next;
    });
    toast({ title: 'Geofence updated' });
    void loadGeofences();
  };

  const removeFence = async (id: string) => {
    const { error: dErr } = await supabase.from('vehicle_geofences').delete().eq('id', id);
    if (dErr) {
      toast({ title: 'Delete failed', description: dErr.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Geofence removed' });
    void loadGeofences();
  };

  const createFence = async () => {
    if (!newFence.vehicle_id || !newFence.lat || !newFence.lng) {
      toast({ title: 'Vehicle and coordinates are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: cErr } = await supabase.from('vehicle_geofences').insert({
      vehicle_id: newFence.vehicle_id,
      name: newFence.name || 'Operating area',
      center_lat: Number(newFence.lat),
      center_lng: Number(newFence.lng),
      radius_m: Number(newFence.radius || 500),
      active: true,
    });
    setSaving(false);
    if (cErr) {
      toast({ title: 'Could not create geofence', description: cErr.message, variant: 'destructive' });
      return;
    }
    setNewFence({ vehicle_id: '', name: '', lat: '', lng: '', radius: '500' });
    toast({ title: 'Geofence created' });
    void loadGeofences();
  };

  const useLiveLocation = (vehicleId: string) => {
    const v = vehicles.find((x) => x.vehicleId === vehicleId);
    if (v?.telemetry?.latitude != null && v.telemetry.longitude != null) {
      setNewFence((f) => ({
        ...f,
        vehicle_id: vehicleId,
        lat: String(v.telemetry?.latitude),
        lng: String(v.telemetry?.longitude),
      }));
    } else {
      setNewFence((f) => ({ ...f, vehicle_id: vehicleId }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo
        title="Vehicle Telemetry & Mileage | RentMaikar Admin"
        description="Live vehicle tracking, editable geofences, telemetry monitoring and exportable daily/monthly mileage logs per vehicle and driver."
      />
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Admin Dashboard
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Vehicle Telemetry & Mileage</h1>
          <p className="text-muted-foreground text-sm">
            Live tracking, geofencing, telemetry health and mileage records per vehicle and driver.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && (
          <div className="flex items-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading fleet…
          </div>
        )}

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="live">Live Tracking</TabsTrigger>
            <TabsTrigger value="geofences">Geofences</TabsTrigger>
            <TabsTrigger value="mileage">Mileage Log</TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live vehicle telemetry</CardTitle>
                <CardDescription>
                  Auto-refreshes every 30 seconds. {live.length} of {vehicles.length} vehicles reporting.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Provisioning</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Ignition</TableHead>
                      <TableHead className="text-right">Speed</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Last fix</TableHead>
                      <TableHead className="text-right">Today (mi)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((v) => (
                      <TableRow key={v.vehicleId}>
                        <TableCell className="font-medium">
                          {v.year ?? ''} {v.make} {v.model}
                          <div className="text-xs text-muted-foreground">{v.licensePlate ?? '—'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={v.provisioningStage === 'ready' ? 'default' : 'secondary'}>
                            {v.provisioningStage ?? 'none'}
                          </Badge>
                        </TableCell>
                        <TableCell>{v.assignedDriverId ? v.assignedDriverId.slice(0, 8) : '—'}</TableCell>
                        <TableCell>
                          {v.telemetry ? (v.telemetry.ignition ? 'On' : 'Off') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {v.telemetry?.speed != null ? `${v.telemetry.speed.toFixed(0)}` : '—'}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {v.telemetry?.address ??
                            (v.telemetry?.latitude != null
                              ? `${v.telemetry.latitude.toFixed(4)}, ${v.telemetry.longitude?.toFixed(4)}`
                              : '—')}
                        </TableCell>
                        <TableCell>
                          {v.telemetry?.lastEventAt
                            ? format(new Date(v.telemetry.lastEventAt), 'PP p')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">{v.milesToday.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geofences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" /> New geofence
                </CardTitle>
                <CardDescription>Define an operating area around a vehicle's location.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1 md:col-span-2">
                  <Label>Vehicle</Label>
                  <Select value={newFence.vehicle_id} onValueChange={useLiveLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.vehicleId} value={v.vehicleId}>
                          {v.year ?? ''} {v.make} {v.model} {v.licensePlate ? `· ${v.licensePlate}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={newFence.name}
                    onChange={(e) => setNewFence({ ...newFence, name: e.target.value })}
                    placeholder="Operating area"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input
                    value={newFence.lat}
                    onChange={(e) => setNewFence({ ...newFence, lat: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input
                    value={newFence.lng}
                    onChange={(e) => setNewFence({ ...newFence, lng: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Radius (m)</Label>
                  <Input
                    type="number"
                    value={newFence.radius}
                    onChange={(e) => setNewFence({ ...newFence, radius: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => void createFence()} disabled={saving}>
                    <MapPin className="h-4 w-4 mr-1" /> Create
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Existing geofences</CardTitle>
                <CardDescription>Edit centre, radius and active state inline.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Latitude</TableHead>
                      <TableHead>Longitude</TableHead>
                      <TableHead>Radius (m)</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Breach</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {geofences.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No geofences configured.
                        </TableCell>
                      </TableRow>
                    )}
                    {geofences.map((f) => {
                      const d = draft[f.id] ?? {};
                      const set = (patch: Partial<GeofenceRow>) =>
                        setDraft((prev) => ({ ...prev, [f.id]: { ...prev[f.id], ...patch } }));
                      return (
                        <TableRow key={f.id}>
                          <TableCell>{vehicleName(f.vehicle_id)}</TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-36"
                              value={(d.name ?? f.name) ?? ''}
                              onChange={(e) => set({ name: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-28"
                              value={String(d.center_lat ?? f.center_lat)}
                              onChange={(e) => set({ center_lat: Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-28"
                              value={String(d.center_lng ?? f.center_lng)}
                              onChange={(e) => set({ center_lng: Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-8 w-24"
                              value={String(d.radius_m ?? f.radius_m)}
                              onChange={(e) => set({ radius_m: Number(e.target.value) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={d.active ?? f.active}
                              onCheckedChange={(v) => set({ active: v })}
                            />
                          </TableCell>
                          <TableCell className="text-xs">
                            {f.breached_at ? (
                              <Badge variant="destructive">
                                {format(new Date(f.breached_at), 'PP p')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Within bounds</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!draft[f.id] || saving}
                              onClick={() => void saveFence(f)}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void removeFence(f.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mileage" className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `mileage-daily-${new Date().toISOString().slice(0, 10)}.csv`,
                    mileage.map((m) => ({
                      date: m.log_date,
                      vehicle: vehicleName(m.vehicle_id),
                      vehicle_id: m.vehicle_id,
                      driver_id: m.driver_id ?? '',
                      miles: Number(m.miles).toFixed(2),
                      odometer_start: m.odometer_start ?? '',
                      odometer_end: m.odometer_end ?? '',
                      source: m.source,
                    })),
                  )
                }
              >
                <Download className="h-4 w-4 mr-1" /> Export daily CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `mileage-monthly-${new Date().toISOString().slice(0, 7)}.csv`,
                    monthly.map((m) => ({
                      month: m.month,
                      vehicle: vehicleName(m.vehicle_id),
                      vehicle_id: m.vehicle_id,
                      driver_id: m.driver_id ?? '',
                      miles: m.miles.toFixed(2),
                      days_logged: m.days,
                    })),
                  )
                }
              >
                <Download className="h-4 w-4 mr-1" /> Export monthly CSV
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily mileage (per vehicle per driver)</CardTitle>
              </CardHeader>
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
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No mileage records yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {mileage.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.log_date}</TableCell>
                        <TableCell>{vehicleName(m.vehicle_id)}</TableCell>
                        <TableCell>{m.driver_id ? m.driver_id.slice(0, 8) : '—'}</TableCell>
                        <TableCell className="text-right">{Number(m.miles).toFixed(1)}</TableCell>
                        <TableCell>{m.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly rollup</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-right">Miles</TableHead>
                      <TableHead className="text-right">Days logged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthly.map((m) => (
                      <TableRow key={`${m.month}-${m.vehicle_id}-${m.driver_id}`}>
                        <TableCell>{m.month}</TableCell>
                        <TableCell>{vehicleName(m.vehicle_id)}</TableCell>
                        <TableCell>{m.driver_id ? m.driver_id.slice(0, 8) : '—'}</TableCell>
                        <TableCell className="text-right">{m.miles.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{m.days}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
