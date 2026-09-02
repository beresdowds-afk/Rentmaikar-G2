import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Power, Shield, Wifi, CheckCircle2, XCircle } from 'lucide-react';
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
  activated_at: string | null;
  last_ping: string | null;
  sim_provider?: string | null;
  sim_number?: string | null;
}

export const DeviceActivation = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; device: Device | null; action: 'activate' | 'deactivate' }>({ open: false, device: null, action: 'activate' });

  const load = async () => {
  setLoading(true);

  try {
    const { data, error } =
      await supabase.functions.invoke("iot-admin", {
        body:{
          action:"list_devices"
        }
      });

    if(error){
      console.error(error);
      throw error;
    }

    if(!Array.isArray(data?.devices)){
      throw new Error(
        "Invalid response from iot-admin"
      );
    }

    setDevices(data.devices);

  } catch(err:any){

    console.error(
      "Device loading failed:",
      err
    );

    toast.error(
      "Failed to load devices",
      {
        description:
          err.message || "Unknown error"
      }
    );

  } finally {

    setLoading(false);

  }
};


const runToggle = async () => {

  const device = confirm.device;

  if(!device || !confirm.action)
    return;


  setWorking(device.id);

  try{

    const action =
      confirm.action === "activate"
      ? "activate_pair"
      : "suspend_pair";


    const {data,error} =
      await supabase.functions.invoke(
        "iot-admin",
        {
          body:{
            action,
            device_id:device.id
          }
        }
      );


    if(error || data?.error){

      throw new Error(
        error?.message ??
        data?.error ??
        "Operation failed"
      );

    }


    toast.success(
      confirm.action === "activate"
      ? "Device activated"
      : "Device suspended"
    );


    setConfirm({
      open:false,
      device:null,
      action:"activate"
    });


    await load();


  }catch(err:any){

    toast.error(
      "Action failed",
      {
        description:
          err.message
      }
    );

  }finally{

    setWorking(null);

  }

};

  const active = devices.filter((d) => d.status === 'active').length;
  const inactive = devices.filter((d) => d.status === 'inactive').length;
  const offline = devices.filter((d) => d.status === 'offline').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Active</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{active}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><XCircle className="h-4 w-4 text-gray-400" /> Inactive</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-gray-500">{inactive}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wifi className="h-4 w-4 text-red-500" /> Offline</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{offline}</div></CardContent></Card>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Activation goes live</AlertTitle>
        <AlertDescription>
          Activating a device tells Hologram to bring the eSIM to <strong>live</strong> state and marks the device ready for physical installation. Telemetry starts flowing to MQTT / Traccar as soon as the device powers on.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Device activation control</CardTitle>
          <CardDescription>Only devices with a SIM linked can be activated.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>IMEI</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Activated</TableHead>
                    <TableHead>Last ping</TableHead>
                    <TableHead>Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No devices to activate.</TableCell></TableRow>
                  ) : devices.map(d => {
                    const hasSim = !!d.sim_provider;
                    return (
                      <TableRow key={d.id}>
                        <TableCell><div className="font-medium">{d.serial_number}</div><div className="text-xs text-muted-foreground">{d.device_model}</div></TableCell>
                        <TableCell className="font-mono text-xs">{d.imei}</TableCell>
                        <TableCell>{hasSim ? <Badge>{d.sim_provider}</Badge> : <Badge variant="secondary">no SIM</Badge>}</TableCell>
                        <TableCell><Badge variant={d.status === 'active' ? 'default' : 'secondary'}>{d.status}</Badge></TableCell>
                        <TableCell className="text-xs">{d.activated_at ? new Date(d.activated_at).toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-xs">{d.last_ping ? new Date(d.last_ping).toLocaleString() : '—'}</TableCell>
                        <TableCell>
                          <Switch
                            checked={d.status === 'active'}
                            disabled={!hasSim || working === d.id}
                            onCheckedChange={() => setConfirm({
                              open: true, device: d,
                              action: d.status === 'active' ? 'deactivate' : 'activate',
                            })}
                          />
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

      <Dialog open={confirm.open} onOpenChange={o => !o && setConfirm({ open: false, device: null, action: 'activate' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm.action === 'activate' ? 'Activate telemetry?' : 'Suspend telemetry?'}</DialogTitle>
            <DialogDescription>
              {confirm.action === 'activate'
                ? <>This will activate the eSIM on Hologram and mark the paired device <strong>ready for install</strong>. Once mounted on the vehicle, it will report live to the map.</>
                : <>This suspends the eSIM on Hologram and marks the device inactive. Telemetry will stop.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm({ open: false, device: null, action: 'activate' })}>Cancel</Button>
            <Button variant={confirm.action === 'deactivate' ? 'destructive' : 'default'} onClick={runToggle} disabled={!!working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Power className="h-4 w-4 mr-1" />}
              {confirm.action === 'activate' ? 'Activate' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
