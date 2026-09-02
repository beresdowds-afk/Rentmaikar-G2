import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, RefreshCw, Search, MapPin, MessageSquare, Cpu, Save, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type HologramDevice = {
  id: number;
  name?: string;
  iccid?: string;
  imei?: string;
  phonenumber?: string;
  lastsession?: { session_begin?: string } | null;
  last_session_time?: string | null;
  tunnelable?: boolean;
  links?: { cellular?: Array<{ id?: number; sim?: string; msisdn?: string; state?: string }> };
  [k: string]: unknown;
};

const invoke = async (action: string, body: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.functions.invoke("hologram-admin", {
    body: { action, ...body },
  });
  if (error) throw new Error(error.message);
  if ((data as { ok?: boolean })?.ok === false) {
    throw new Error(JSON.stringify((data as { body?: unknown }).body ?? data));
  }
  return data as { body?: { data?: unknown }; configured?: boolean };
};

export function HologramDevicesPanel() {
  const [devices, setDevices] = useState<HologramDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HologramDevice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sms, setSms] = useState("");
  const [rename, setRename] = useState("");
  const [location, setLocation] = useState<Record<string, unknown> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await invoke("list_devices", { limit: 200 });
      const rows = (res?.body?.data ?? []) as HologramDevice[];
      setDevices(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error("Could not load Hologram devices", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(d =>
      [d.name, d.iccid, d.links?.cellular?.[0]?.sim, d.imei, d.phonenumber, d.links?.cellular?.[0]?.msisdn, String(d.id)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }, [devices, query]);

  const open = (d: HologramDevice) => {
    setSelected(d);
    setRename(d.name ?? "");
    setSms("");
    setLocation(null);
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search device name, ICCID, IMEI…"
            value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading devices…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No Hologram devices returned for this organization.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>ICCID</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Link state</TableHead>
                  <TableHead>Last session</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(d => {
                  const link = d.links?.cellular?.[0];
                  const state = link?.state ?? "—";
                  const iccid = d.iccid || link?.sim || "";
                  const number = d.phonenumber || link?.msisdn || "";
                  const last = d.lastsession?.session_begin ?? d.last_session_time ?? null;
                  return (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => open(d)}>
                      <TableCell className="font-medium">{d.name || "Unnamed"}</TableCell>
                      <TableCell className="font-mono text-xs">{d.id}</TableCell>
                      <TableCell className="font-mono text-xs">{iccid || "—"}</TableCell>
                      <TableCell>{number || "—"}</TableCell>
                      <TableCell><Badge variant={state === "live" ? "default" : "secondary"}>{state}</Badge></TableCell>
                      <TableCell className="text-xs">{last ? new Date(last).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button asChild size="sm" variant="ghost" className="gap-1">
                          <Link to={`/admin/hologram/devices/${d.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> {selected.name || `Device ${selected.id}`}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  Hologram device ID <code>{selected.id}</code>
                  <Link className="underline inline-flex items-center gap-1" to={`/admin/hologram/devices/${selected.id}`}>
                    <ExternalLink className="h-3 w-3" /> Full detail
                  </Link>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Rename device</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Input value={rename} onChange={(e) => setRename(e.target.value)} placeholder="Device name" />
                    <Button
                      size="sm" className="gap-2" disabled={!rename || busy === "rename"}
                      onClick={() => act("rename", async () => {
                        await invoke("rename_device", { device_id_ext: selected.id, name: rename });
                        toast.success("Device renamed");
                        await load();
                      })}
                    >
                      {busy === "rename" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Approximate location</CardTitle>
                    <CardDescription>Cell-tower derived, from Hologram — not GPS.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      size="sm" variant="outline" disabled={busy === "loc"}
                      onClick={() => act("loc", async () => {
                        const res = await invoke("device_location", { device_id_ext: selected.id });
                        setLocation((res?.body?.data as Record<string, unknown>) ?? null);
                      })}
                    >
                      {busy === "loc" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch location"}
                    </Button>
                    {location && (
                      <pre className="text-[11px] overflow-x-auto rounded-md border p-2">
{JSON.stringify(location, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Send SMS to device</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Textarea
                      value={sms} onChange={(e) => setSms(e.target.value)}
                      placeholder="Message body (max 1600 chars)" maxLength={1600} rows={3}
                    />
                    <Button
                      size="sm" disabled={!sms.trim() || busy === "sms"}
                      onClick={() => act("sms", async () => {
                        await invoke("send_sms", { device_id_ext: selected.id, message: sms.trim() });
                        toast.success("SMS queued to device");
                        setSms("");
                      })}
                    >
                      {busy === "sms" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                  </CardContent>
                </Card>

                <details className="rounded-md border p-3">
                  <summary className="text-xs font-medium cursor-pointer">Raw device payload</summary>
                  <pre className="text-[11px] mt-2 overflow-x-auto">
{JSON.stringify(selected, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
