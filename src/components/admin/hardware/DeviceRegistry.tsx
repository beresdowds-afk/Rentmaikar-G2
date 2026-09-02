import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, ShoppingCart, RefreshCw, Loader2, Info, Cpu, CreditCard as SimCard } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Sim {
  id: string;
  iccid: string;
  msisdn: string | null;
  provider: string;
  provider_sim_id: string | null;
  status: string;
  plan_name: string | null;
  data_usage_mb: number | null;
  data_limit_mb: number | null;
  device_id: string | null;
  vehicle_id: string | null;
  metadata: any;
  created_at: string;
}
interface Device {
  id: string;
  serial_number: string;
  imei: string;
  device_model: string | null;
  firmware_version: string | null;
  status: string;
  is_linked: boolean;
  vehicle_id: string | null;
}

export const DeviceRegistry = () => {
  const [sims, setSims] = useState<Sim[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<{ id: number; name: string; monthly_mb: number }[]>([]);
  const [hologramConfigured, setHologramConfigured] = useState<boolean | null>(null);

  const [buyOpen, setBuyOpen] = useState(false);
  const [buySource, setBuySource] = useState<'hologram' | 'manual'>('hologram');
  const [buyProvider, setBuyProvider] = useState('hologram');
  const [buyPlan, setBuyPlan] = useState<string>('128');
  const [buyNotes, setBuyNotes] = useState('');
  const [buyIccid, setBuyIccid] = useState('');
  const [buyMsisdn, setBuyMsisdn] = useState('');
  const [buyImsi, setBuyImsi] = useState('');
  const [buyPlanName, setBuyPlanName] = useState('');
  const [buying, setBuying] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [nd, setNd] = useState({
    serial_number: '',
    imei: '',
    device_model: 'GPS-01',
    firmware_version: '',
    notes: '',
  });
  const [adding, setAdding] = useState(false);

  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [simsRes, devRes, plansRes] = await Promise.all([
        supabase.functions.invoke('iot-admin', { body: { action: 'list_available_sims' } }),
        supabase.functions.invoke('iot-admin', { body: { action: 'list_devices' } }),
        supabase.functions.invoke('iot-admin', { body: { action: 'list_plans' } }),
      ]);
      if (simsRes.error) throw simsRes.error;
      if (devRes.error) throw devRes.error;
      setSims((simsRes.data as any)?.sims ?? []);
      setDevices((devRes.data as any)?.devices ?? []);
      if (!plansRes.error) {
        setPlans((plansRes.data as any)?.plans ?? []);
        setHologramConfigured((plansRes.data as any)?.configured ?? false);
      }
    } catch (err: any) {
      toast.error('Failed to load inventory', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
        if (!mounted) return;
        await load();
    };

    fetchData();

    return () => {
        mounted = false;
    };
}, []);

  const buySim = async () => {
    if (buySource === 'manual' && !buyIccid.trim()) {
      toast.error('ICCID is required for manual entry');
      return;
    }
    setBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: {
          action: 'purchase_sim',
          source: buySource,
          provider: buySource === 'manual' ? (buyProvider.trim() || 'manual') : 'hologram',
          plan_id: buySource === 'hologram' ? Number(buyPlan) : undefined,
          plan_name: buySource === 'manual' ? (buyPlanName.trim() || null) : undefined,
          notes: buyNotes || null,
          iccid: buyIccid || undefined,
          msisdn: buyMsisdn || undefined,
          imsi: buyImsi || undefined,
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success(buySource === 'manual' ? 'SIM added to inventory' : 'eSIM added to inventory', {
        description: buySource === 'manual'
          ? `Recorded manually under provider "${buyProvider || 'manual'}".`
          : (data as any)?.hologram_configured
            ? 'Provisioned from Hologram pool.'
            : 'Recorded locally — add HOLOGRAM_API_KEY to sync with the provider.',
      });
      setBuyOpen(false);
      setBuyNotes(''); setBuyIccid(''); setBuyMsisdn(''); setBuyImsi(''); setBuyPlanName('');
      load();
    } catch (err: any) {
      toast.error('Could not add SIM', { description: err.message });
    } finally {
      setBuying(false);
    }
  };

  const addDevice = async () => {
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'register_device', ...nd },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success(`Device ${nd.serial_number} registered`);
      setAddOpen(false);
      setNd({ serial_number: '', imei: '', device_model: 'GPS-01', firmware_version: '', notes: '' });
      load();
    } catch (err: any) {
      toast.error('Could not register device', { description: err.message });
    } finally {
      setAdding(false);
    }
  };

  const syncSim = async (id: string) => {
    setSyncingId(id);
    try {
      const { data, error } = await supabase.functions.invoke('iot-admin', {
        body: { action: 'sync_sim', sim_id: id },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      if ((data as any)?.skipped) toast.info('Hologram not configured — nothing to sync');
      else toast.success('SIM state refreshed');
      load();
    } catch (err: any) {
      toast.error('Sync failed', { description: err.message });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {hologramConfigured === false && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Hologram is not configured. You can still add eSIMs to inventory and continue the flow — add the
            <code className="mx-1">HOLOGRAM_API_KEY</code> and <code>HOLOGRAM_ORG_ID</code> secrets to
            provision real eSIMs and to activate them for live telemetry.
          </AlertDescription>
        </Alert>
      )}

      {/* eSIM inventory */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><SimCard className="h-5 w-5" /> SIM / eSIM Inventory</CardTitle>
              <CardDescription>Buy eSIMs from Hologram <strong>or</strong> add SIMs manually from another provider. Each SIM tracks its provider so you know how it was sourced.</CardDescription>
            </div>
            <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
              <DialogTrigger asChild>
                <Button><ShoppingCart className="mr-2 h-4 w-4" /> Add SIM</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add SIM to inventory</DialogTitle>
                  <DialogDescription>Buy a new eSIM from Hologram, or record a SIM you already own from any provider.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Source</Label>
                    <Select value={buySource} onValueChange={(v) => setBuySource(v as 'hologram' | 'manual')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hologram">Buy from Hologram</SelectItem>
                        <SelectItem value="manual">Manual entry (other provider)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {buySource === 'hologram' ? (
                    <div>
                      <Label>Data plan</Label>
                      <Select value={buyPlan} onValueChange={setBuyPlan}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {plans.length === 0 ? (
                            <SelectItem value="128">Global Flexible 10 MB</SelectItem>
                          ) : plans.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Provider *</Label>
                        <Input value={buyProvider} onChange={e => setBuyProvider(e.target.value)} placeholder="e.g. MTN, Airtel, Twilio" />
                      </div>
                      <div>
                        <Label>Plan name</Label>
                        <Input value={buyPlanName} onChange={e => setBuyPlanName(e.target.value)} placeholder="e.g. 5GB Monthly" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>ICCID {buySource === 'manual' ? '*' : '(optional)'}</Label>
                      <Input value={buyIccid} onChange={e => setBuyIccid(e.target.value)} placeholder={buySource === 'manual' ? '19-20 digit ICCID' : 'Auto if provisioned'} />
                    </div>
                    <div>
                      <Label>MSISDN {buySource === 'manual' ? '' : '(optional)'}</Label>
                      <Input value={buyMsisdn} onChange={e => setBuyMsisdn(e.target.value)} placeholder="+1234…" />
                    </div>
                  </div>
                  {buySource === 'manual' && (
                    <div>
                      <Label>IMSI (optional)</Label>
                      <Input value={buyImsi} onChange={e => setBuyImsi(e.target.value)} placeholder="15-digit IMSI" />
                    </div>
                  )}
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={buyNotes} onChange={e => setBuyNotes(e.target.value)} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
                  <Button onClick={buySim} disabled={buying}>
                    {buying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
                    {buySource === 'manual' ? 'Add to inventory' : 'Buy & add to inventory'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : sims.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No eSIMs in inventory. Click <strong>Buy eSIM</strong> to start.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ICCID</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>MSISDN</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead className="text-right">Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sims.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.iccid}</TableCell>
                      <TableCell>
                        <Badge variant={s.provider === 'hologram' ? 'default' : 'outline'} className="capitalize">
                          {s.provider || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.msisdn || '—'}</TableCell>
                      <TableCell>{s.plan_name || '—'}</TableCell>
                      <TableCell><Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{s.status}</Badge></TableCell>
                      <TableCell className="text-sm">{s.data_usage_mb ?? 0} MB</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => syncSim(s.id)}
                          disabled={syncingId === s.id || s.provider !== 'hologram'}
                          title={s.provider === 'hologram' ? 'Sync with Hologram' : 'Sync only available for Hologram SIMs'}
                        >
                          {syncingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5" /> Tracking Devices</CardTitle>
              <CardDescription>Register GPS/tracking devices. Use the <strong>Vehicle Linking</strong> tab to pair a SIM by IMEI and assign to a vehicle.</CardDescription>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Register device</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register tracking device</DialogTitle>
                  <DialogDescription>IMEI is the unique 15-digit identifier printed on the device.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Serial number *</Label><Input value={nd.serial_number} onChange={e => setNd({ ...nd, serial_number: e.target.value })} /></div>
                  <div><Label>IMEI * (15 digits)</Label><Input value={nd.imei} onChange={e => setNd({ ...nd, imei: e.target.value.replace(/\D/g, '') })} maxLength={15} /></div>
                  <div>
                    <Label>Model</Label>
                    <Select value={nd.device_model} onValueChange={v => setNd({ ...nd, device_model: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GPS-01">GPS-01 (Basic)</SelectItem>
                        <SelectItem value="GPS-01 Pro">GPS-01 Pro</SelectItem>
                        <SelectItem value="GPS-02">GPS-02 (Fleet)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Firmware</Label><Input value={nd.firmware_version} onChange={e => setNd({ ...nd, firmware_version: e.target.value })} placeholder="2.1.5" /></div>
                  <div className="col-span-2"><Label>Notes</Label><Textarea value={nd.notes} onChange={e => setNd({ ...nd, notes: e.target.value })} rows={2} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addDevice} disabled={adding || !nd.serial_number || nd.imei.length !== 15}>
                    {adding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No devices registered yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial</TableHead>
                    <TableHead>IMEI</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vehicle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.serial_number}</TableCell>
                      <TableCell className="font-mono text-xs">{d.imei}</TableCell>
                      <TableCell>{d.device_model || '—'}</TableCell>
                      <TableCell><Badge variant={d.status === 'active' ? 'default' : 'secondary'}>{d.status}</Badge></TableCell>
                      <TableCell>{d.vehicle_id ? <Badge variant="outline">Linked</Badge> : <span className="text-muted-foreground text-sm">Not linked</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
