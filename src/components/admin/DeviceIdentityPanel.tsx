import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Fingerprint, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DeviceIdentity {
  id: string;
  identity_key: string;
  bundle_level: number;
  status: string;
  iccid: string | null;
  sim_provider: string | null;
  imei: string | null;
  serial_number: string | null;
  license_plate: string | null;
  vin: string | null;
  mqtt_client_id: string | null;
  topic_prefix: string | null;
  telemetry_provider: string | null;
  driver_id: string | null;
  owner_id: string | null;
  last_synced_at: string;
}

const LEVELS: Record<number, string> = {
  1: "Tracker only",
  2: "SIM + tracker",
  3: "+ Vehicle",
  4: "+ Driver",
  5: "+ Tracking service",
};

export const DeviceIdentityPanel = () => {
  const [rows, setRows] = useState<DeviceIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("device_identities")
      .select(
        "id,identity_key,bundle_level,status,iccid,sim_provider,imei,serial_number,license_plate,vin,mqtt_client_id,topic_prefix,telemetry_provider,driver_id,owner_id,last_synced_at",
      )
      .order("bundle_level", { ascending: false })
      .limit(500);
    if (error) toast.error("Failed to load device identities", { description: error.message });
    setRows((data as DeviceIdentity[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const rebuild = async () => {
    setRebuilding(true);
    const { data, error } = await supabase.rpc("rebuild_all_device_identities");
    if (error) toast.error("Rebuild failed", { description: error.message });
    else toast.success(`Rebuilt ${data ?? 0} identity records`);
    setRebuilding(false);
    await load();
  };

  const filtered = rows.filter((r) =>
    !q
      ? true
      : [r.identity_key, r.iccid, r.imei, r.serial_number, r.license_plate, r.vin, r.mqtt_client_id]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q.toLowerCase())),
  );

  const complete = rows.filter((r) => r.bundle_level === 5).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> Identity records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Fully bundled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{complete}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Incomplete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{rows.length - complete}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Device identity registry</CardTitle>
            <CardDescription>
              One record per tracker bundling ((((SIM + tracker) + vehicle) + driver) + EMQX/Traccar tracking).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={rebuild} disabled={rebuilding}>
            {rebuilding ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Rebuild
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search identity key, ICCID, IMEI, plate, VIN, MQTT client id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identity</TableHead>
                    <TableHead>Bundle</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Tracker</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead>Synced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No device identity records yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.identity_key}</TableCell>
                        <TableCell>
                          <Badge variant={r.bundle_level === 5 ? "default" : "secondary"}>
                            L{r.bundle_level} · {LEVELS[r.bundle_level] ?? r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.iccid ? (
                            <>
                              <div className="font-mono">{r.iccid}</div>
                              <div className="text-muted-foreground">{r.sim_provider}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{r.imei ?? "—"}</div>
                          <div className="text-muted-foreground">{r.serial_number}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{r.license_plate ?? "—"}</div>
                          <div className="text-muted-foreground font-mono">{r.vin}</div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.driver_id ? r.driver_id.slice(0, 8) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="uppercase">{r.telemetry_provider ?? "—"}</div>
                          <div className="text-muted-foreground font-mono">
                            {r.mqtt_client_id ?? r.topic_prefix ?? ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(r.last_synced_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
