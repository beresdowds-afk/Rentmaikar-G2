import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Link as LinkIcon, Unlink, Car, Loader2, MapPin,
  ShieldCheck, ShieldAlert, CheckCircle2, XCircle, PowerOff, PackageCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Device {
  id: string;
  serial_number: string;
  imei: string;
  device_model: string | null;
  status: string;
  is_linked: boolean;
  vehicle_id: string | null;
  installation_status?: 'pending' | 'confirmed';
  telemetry_enabled?: boolean;
  health_status?: string;
  sim_provider?: string | null;
}
interface Sim { id: string; iccid: string; msisdn: string | null; status: string; device_id: string | null; }
interface Vehicle { id: string; license_plate: string | null; make: string | null; model: string | null; year: number | null; owner_id: string | null; }

type Check = { name: string; ok: boolean; detail?: string };
interface Readiness { ready: boolean; checks: Check[]; sim_state: string | null; health: any; }

export const DeviceLinking = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sims, setSims] = useState<Sim[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // Link SIM dialog
  const [linkSimFor, setLinkSimFor] = useState<Device | null>(null);
  const [pickedSim, setPickedSim] = useState<string>('');
  const [imeiConfirm, setImeiConfirm] = useState<string>('');
  const [linking, setLinking] = useState(false);

  // Link vehicle dialog (with readiness gate)
  const [linkVehicleFor, setLinkVehicleFor] = useState<Device | null>(null);
  const [pickedVehicle, setPickedVehicle] = useState<string>('');
  const [vehLinking, setVehLinking] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [checkingReady, setCheckingReady] = useState(false);
  const [forceLink, setForceLink] = useState(false);

  // Install confirmation
  const [confirmInstallFor, setConfirmInstallFor] = useState<Device | null>(null);
  const [installNotes, setInstallNotes] = useState('');
  const [installing, setInstalling] = useState(false);

  // Deactivate
  const [deactivateFor, setDeactivateFor] = useState<Device | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [devRes, simRes, vehRes] = await Promise.all([
        supabase.functions.invoke('iot-admin', { body: { action: 'list_devices' } }),
        supabase.functions.invoke('iot-admin', { body: { action: 'list_available_sims' } }),
        supabase.from('vehicles').select('id, license_plate, make, model, year, owner_id').order('created_at', { ascending: false }),
      ]);
      if (devRes.error) throw devRes.error;
      if (simRes.error) throw simRes.error;
      if (vehRes.error) throw vehRes.error;
      setDevices((devRes.data as any).devices || []);
      setSims((simRes.data as any).sims || []);
      setVehicles((vehRes.data as Vehicle[]) || []);
    } catch (err: any) {
      toast.error('Failed to load', { description: err.message });
    } finally { setLoading(false); }
  };

  useEffect(() => {
  const init = async () => {
    await load();
  };

  init();
}, []);
  const availableSims = sims;
  const vehiclesWithDevice = new Set(devices.filter(d => d.vehicle_id).map(d => d.vehicle_id));
  const availableVehicles = vehicles.filter(v => !vehiclesWithDevice.has(v.id));

  const openLinkSim = (d: Device) => { setLinkSimFor(d); setPickedSim(''); setImeiConfirm(''); };

  const submitLinkSim = async () => {
    if (!linkSimFor || !pickedSim) return;
    if (imeiConfirm.trim() !== linkSimFor.imei) { toast.error('IMEI does not match'); return; }
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'link_sim_to_device', device_imei: linkSimFor.imei, sim_id: pickedSim },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('SIM linked to device', { description: 'You can now activate the pair.' });
      setLinkSimFor(null); load();
    } catch (err) {
  toast.error('Link failed', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    } finally { setLinking(false); }
  };

  const openLinkVehicle = async (d: Device) => {
    setLinkVehicleFor(d); setPickedVehicle(''); setForceLink(false); setReadiness(null);
    setCheckingReady(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'readiness_check', device_id: d.id },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      setReadiness(data as Readiness);
    } catch (err) {
  toast.error('Readiness Check failed', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    } finally { setCheckingReady(false); }
  };

  const submitLinkVehicle = async () => {
    if (!linkVehicleFor || !pickedVehicle) return;
    setVehLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'link_to_vehicle', device_id: linkVehicleFor.id, vehicle_id: pickedVehicle, force: forceLink },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('Device linked to vehicle', {
        description: 'Installation is now pending. Confirm installation to enable live map & telemetry.',
      });
      setLinkVehicleFor(null); setPickedVehicle('');
      await load();
    } catch (err) {
  toast.error('Link Failed', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    } finally { setVehLinking(false); }
  };

  const unlinkVehicle = async (d: Device) => {
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'unlink_from_vehicle', device_id: d.id },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('Device unlinked from vehicle');
      await load();
    } catch (err) {
  toast.error('Unlink Failed', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    }
  };


  const submitConfirmInstall = async () => {
    if (!confirmInstallFor) return;
    setInstalling(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'confirm_installation', device_id: confirmInstallFor.id, notes: installNotes },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('Installation confirmed', { description: 'Device is now live on the map.' });
      setConfirmInstallFor(null); setInstallNotes(''); 
      await load();
    } catch (err) {
  toast.error('Could not Confirm', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    } finally { setInstalling(false); }
  };

  const submitDeactivate = async () => {
    if (!deactivateFor) return;
    if (deactivateReason.trim().length < 5) { toast.error('Reason required (≥ 5 chars)'); return; }
    setDeactivating(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'deactivate_device', device_id: deactivateFor.id, reason: deactivateReason.trim() },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success('Device deactivated', { description: (data as any)?.message });
      setDeactivateFor(null); setDeactivateReason(''); 
      await load();
    } catch (err) {
  toast.error('Deactivation failed', {
    description:
      err instanceof Error
        ? err.message
        : 'Unexpected error occurred',
  });
    } finally { setDeactivating(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Alert>
        <MapPin className="h-4 w-4" />
        <AlertDescription>
          <strong>Workflow:</strong> Register device → link eSIM by IMEI → activate the pair → readiness check → link to vehicle → confirm installation. Live map & telemetry are only enabled after installation is confirmed.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LinkIcon className="h-5 w-5" /> Devices, SIM &amp; Vehicle</CardTitle>
          <CardDescription>Pair a SIM by IMEI, verify readiness, attach to a vehicle, then confirm the physical installation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IMEI</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Installation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Register devices in the Device Registry tab first.</TableCell></TableRow>
                ) : devices.map(d => {
                  const vehicle = vehicles.find(v => v.id === d.vehicle_id);
                  const installConfirmed = d.installation_status === 'confirmed';
                  return (
                    <TableRow key={d.id}>
                      <TableCell><div className="font-medium">{d.serial_number}</div><div className="text-xs text-muted-foreground">{d.device_model}</div></TableCell>
                      <TableCell className="font-mono text-xs">{d.imei}</TableCell>
                      <TableCell>
                        <Badge variant={d.sim_provider ? 'default' : 'secondary'}>
                          {d.sim_provider ? 'SIM linked' : 'No SIM'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {vehicle
                          ? <div><div className="font-medium">{vehicle.license_plate}</div><div className="text-xs text-muted-foreground">{vehicle.year} {vehicle.make} {vehicle.model}</div></div>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell className="space-y-1">
                        <Badge variant={installConfirmed ? 'default' : 'secondary'}>
                          {d.vehicle_id ? (installConfirmed ? 'Confirmed · Live' : 'Pending install') : '—'}
                        </Badge>
                        {d.health_status && d.health_status !== 'unknown' && (
                          <div className="text-xs text-muted-foreground">Health: {d.health_status}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => openLinkSim(d)} disabled={!!d.sim_provider}>
                          <LinkIcon className="h-4 w-4 mr-1" /> Link SIM
                        </Button>
                        {d.vehicle_id ? (
                          <>
                            {!installConfirmed && (
                              <Button size="sm" onClick={() => { setConfirmInstallFor(d); setInstallNotes(''); }}>
                                <PackageCheck className="h-4 w-4 mr-1" /> Confirm install
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => unlinkVehicle(d)}>
                              <Unlink className="h-4 w-4 mr-1" /> Unlink
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={() => openLinkVehicle(d)} disabled={d.status !== 'active'}>
                            <Car className="h-4 w-4 mr-1" /> Link vehicle
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => { setDeactivateFor(d); setDeactivateReason(''); }}>
                          <PowerOff className="h-4 w-4 mr-1" /> Deactivate
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Link SIM dialog */}
      <Dialog open={!!linkSimFor} onOpenChange={o => !o && setLinkSimFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link eSIM to device by IMEI</DialogTitle>
            <DialogDescription>
              Device IMEI: <span className="font-mono">{linkSimFor?.imei}</span>. Retype to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Available eSIM</Label>
              <Select value={pickedSim} onValueChange={setPickedSim}>
                <SelectTrigger><SelectValue placeholder={availableSims.length ? 'Choose SIM…' : 'No available SIMs — buy one first'} /></SelectTrigger>
                <SelectContent>
                  {availableSims.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.iccid} {s.msisdn ? `• ${s.msisdn}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Confirm IMEI</Label>
              <Input value={imeiConfirm} onChange={e => setImeiConfirm(e.target.value.replace(/\D/g, ''))} maxLength={15} placeholder="Retype the 15-digit IMEI" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkSimFor(null)}>Cancel</Button>
            <Button onClick={submitLinkSim} disabled={linking || !pickedSim || imeiConfirm !== linkSimFor?.imei}>
              {linking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LinkIcon className="h-4 w-4 mr-1" />} Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link vehicle dialog with readiness gate */}
      <Dialog open={!!linkVehicleFor} onOpenChange={o => !o && setLinkVehicleFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Pre-install readiness check
            </DialogTitle>
            <DialogDescription>
              We verify the eSIM is active on Hologram and the device is healthy before you assign it to a vehicle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {checkingReady ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Running checks…</div>
            ) : readiness ? (
              <div className="border rounded-md divide-y">
                {readiness.checks.map((c, i) => (
                  <div key={i} className="p-2 flex items-start gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                    <div className="flex-1">
                      <div className="font-medium">{c.name}</div>
                      {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                    </div>
                  </div>
                ))}
                <div className="p-2 text-sm flex items-center gap-2">
                  {readiness.ready
                    ? <><ShieldCheck className="h-4 w-4 text-primary" /> All checks passed — safe to link.</>
                    : <><ShieldAlert className="h-4 w-4 text-destructive" /> One or more checks failed.</>}
                </div>
              </div>
            ) : null}

            {!readiness?.ready && readiness && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={forceLink} onChange={e => setForceLink(e.target.checked)} />
                Force-link anyway (I accept the device may not go live)
              </label>
            )}

            <div>
              <Label>Vehicle without a device</Label>
              <Select value={pickedVehicle} onValueChange={setPickedVehicle}>
                <SelectTrigger><SelectValue placeholder={availableVehicles.length ? 'Choose vehicle…' : 'All vehicles already have a device'} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {availableVehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.license_plate || v.id.slice(0, 8)} — {v.year} {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkVehicleFor(null)}>Cancel</Button>
            <Button
              onClick={submitLinkVehicle}
              disabled={vehLinking || !pickedVehicle || (!readiness?.ready && !forceLink)}
            >
              {vehLinking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Car className="h-4 w-4 mr-1" />} Link vehicle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm installation dialog */}
      <Dialog open={!!confirmInstallFor} onOpenChange={o => !o && setConfirmInstallFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> Confirm physical installation</DialogTitle>
            <DialogDescription>
              This enables live map visibility and telemetry ingestion for this vehicle. Only do this once the installer has confirmed the hardware is mounted, powered, and reporting.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={installNotes} onChange={e => setInstallNotes(e.target.value)} rows={3} placeholder="e.g. Installed by Kunle, tested ignition + speed, all readings normal." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmInstallFor(null)}>Cancel</Button>
            <Button onClick={submitConfirmInstall} disabled={installing}>
              {installing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PackageCheck className="h-4 w-4 mr-1" />} Confirm & go live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate dialog */}
      <Dialog open={!!deactivateFor} onOpenChange={o => !o && setDeactivateFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PowerOff className="h-5 w-5 text-destructive" /> Deactivate device</DialogTitle>
            <DialogDescription>
              This will pause the eSIM on Hologram, unlink the tracking device from its vehicle, and mark it inactive. It will no longer appear on the map.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason (required, ≥ 5 chars)</Label>
            <Textarea value={deactivateReason} onChange={e => setDeactivateReason(e.target.value)} rows={3} placeholder="e.g. Hardware fault, vehicle retired…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitDeactivate} disabled={deactivating || deactivateReason.trim().length < 5}>
              {deactivating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />} Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
