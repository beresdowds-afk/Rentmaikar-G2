import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Save, RefreshCw, Router, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  TRACCAR_PROTOCOLS,
  resolveTraccarPort,
  traccarIngressEndpoint,
  type PortOverrides,
} from "@/lib/traccar-ports";

const KV_KEY = "traccar_ingress_config";

interface DeviceRow {
  id: string;
  serial_number: string;
  device_model: string | null;
}

/**
 * Resolves the Traccar ingress port for every tracker from its device model and
 * shows the exact `host:port` an installer must program into the unit. Admins can
 * override the port per model without a redeploy.
 */
export function TraccarDevicePortsPanel() {
  const [host, setHost] = useState("");
  const [overrides, setOverrides] = useState<PortOverrides>({});
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: kv }, { data: rows }] = await Promise.all([
      supabase.from("platform_kv_settings").select("value").eq("key", KV_KEY).maybeSingle(),
      supabase
        .from("iot_devices")
        .select("id, serial_number, device_model")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const v = (kv?.value ?? null) as { host?: string; overrides?: PortOverrides } | null;
    setHost(String(v?.host ?? ""));
    setOverrides(v?.overrides ?? {});
    setDevices((rows as DeviceRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const models = useMemo(() => {
    const set = new Map<string, string>();
    for (const d of devices) {
      const m = (d.device_model || "").trim();
      if (m) set.set(m.toLowerCase(), m);
    }
    return Array.from(set.entries());
  }, [devices]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_kv_settings")
        .upsert({ key: KV_KEY, value: { host: host.trim() || null, overrides } }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Ingress host and port map saved");
    } catch (e) {
      toast.error("Could not save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${text}`),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Router className="h-4 w-4" /> Tracker ingress endpoint
          </CardTitle>
          <CardDescription>
            Trackers connect to the raw protocol listener, not the web API. Set the server hostname
            or IP once — the port is derived automatically from each device model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="traccar-ingress-host">Server hostname or IP</Label>
              <Input
                id="traccar-ingress-host"
                placeholder="traccar.rentmaikar.com or 203.0.113.10"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={load} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Reload
              </Button>
            </div>
          </div>
          {!host && (
            <Alert>
              <Router className="h-4 w-4" />
              <AlertTitle>No ingress host set</AlertTitle>
              <AlertDescription className="text-sm">
                Ports still resolve per model, but installers need a host to program into the unit.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Port map by device model</CardTitle>
          <CardDescription>
            Defaults follow Traccar's shipped protocol listeners. Override a port when your server
            runs a non-standard listener for that model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
            </div>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No device models recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Endpoint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map(([key, label]) => {
                  const r = resolveTraccarPort(label, overrides);
                  const ep = traccarIngressEndpoint(host, label, overrides).endpoint;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <code>{r.protocol}</code>
                          <Badge variant={r.source === "override" ? "default" : r.source === "model" ? "secondary" : "outline"}>
                            {r.source}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-24"
                          type="number"
                          value={overrides[key] ?? r.port}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setOverrides((prev) => ({ ...prev, [key]: n }));
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {ep ? (
                          <button type="button" onClick={() => copy(ep)} className="flex items-center gap-1 text-sm underline-offset-2 hover:underline">
                            <code>{ep}</code> <Copy className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-sm">set host above</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reference: default protocol ports</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-xs sm:grid-cols-2">
          {TRACCAR_PROTOCOLS.map((p) => (
            <div key={p.protocol} className="flex justify-between rounded border px-2 py-1">
              <span>{p.label}</span>
              <span className="text-muted-foreground"><code>{p.protocol}</code> · {p.port}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default TraccarDevicePortsPanel;
