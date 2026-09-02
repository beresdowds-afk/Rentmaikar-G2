// Admin audit log for every document export (client + server).
// Filters: exporter, target user, vehicle, date range, status, source.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Download, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

interface AuditRow {
  id: string;
  exporter_id: string;
  target_user_id: string;
  vehicle_id: string | null;
  document_count: number;
  document_ids: string[];
  source: "client" | "server" | string;
  status: string;
  region: string | null;
  zip_size_bytes: number | null;
  storage_path: string | null;
  error: string | null;
  metadata: any;
  created_at: string;
}

const STATUS_OPTIONS = ["all", "completed", "partial", "error"];
const SOURCE_OPTIONS = ["all", "client", "server"];

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-800 border-green-200">Completed</Badge>;
  if (status === "partial") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Partial</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function AdminDocumentExportAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporter, setExporter] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setLoading(true);
    let q = supabase.from("document_export_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (exporter.trim()) q = q.eq("exporter_id", exporter.trim());
    if (targetUser.trim()) q = q.eq("target_user_id", targetUser.trim());
    if (vehicle.trim()) q = q.eq("vehicle_id", vehicle.trim());
    if (status !== "all") q = q.eq("status", status);
    if (source !== "all") q = q.eq("source", source);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) {
      const end = new Date(to); end.setHours(23, 59, 59, 999);
      q = q.lte("created_at", end.toISOString());
    }
    const { data } = await q;
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* initial */ // eslint-disable-next-line
  }, []);

  const totalBytes = useMemo(
    () => rows.reduce((s, r) => s + (r.zip_size_bytes ?? 0), 0),
    [rows],
  );

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Document export audit
        </h1>
        <p className="text-sm text-muted-foreground">
          Every ZIP export (client &amp; server) is recorded here, with the exporter, target user,
          included document IDs, and status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Combine any filters, then Search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="exporter">Exporter user id</Label>
            <Input id="exporter" value={exporter} onChange={(e) => setExporter(e.target.value)}
                   placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="target">Target user id</Label>
            <Input id="target" value={targetUser} onChange={(e) => setTargetUser(e.target.value)}
                   placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="vehicle">Vehicle id</Label>
            <Input id="vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}
                   placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="source">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="source"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setExporter(""); setTargetUser(""); setVehicle("");
              setStatus("all"); setSource("all"); setFrom(""); setTo("");
            }}>
              Reset
            </Button>
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Results ({rows.length})</span>
            <span className="text-xs text-muted-foreground">
              Total ZIP size: {(totalBytes / 1024 / 1024).toFixed(2)} MB
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exports match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">Exporter</th>
                    <th className="py-2 pr-2">Target user</th>
                    <th className="py-2 pr-2">Vehicle</th>
                    <th className="py-2 pr-2">Docs</th>
                    <th className="py-2 pr-2">Source</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Size</th>
                    <th className="py-2 pr-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.exporter_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.target_user_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.vehicle_id ? r.vehicle_id.slice(0, 8) + "…" : "—"}</td>
                      <td className="py-2 pr-2">{r.document_count}</td>
                      <td className="py-2 pr-2 capitalize">{r.source}</td>
                      <td className="py-2 pr-2"><StatusBadge status={r.status} /></td>
                      <td className="py-2 pr-2">
                        {r.zip_size_bytes ? `${(r.zip_size_bytes / 1024).toFixed(0)} KB` : "—"}
                      </td>
                      <td className="py-2 pr-2 text-destructive text-xs max-w-xs truncate">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
