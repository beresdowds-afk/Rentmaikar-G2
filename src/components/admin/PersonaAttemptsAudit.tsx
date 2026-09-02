import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, RotateCcw, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface AttemptRow {
  id: string;
  user_id: string;
  subject_role: string | null;
  subject_type: string | null;
  region: string | null;
  inquiry_id: string | null;
  template_id: string | null;
  offered_id_classes: { code: string; label: string }[] | null;
  chosen_id_class: string | null;
  status: string;
  result: string | null;
  error_code: string | null;
  error_detail: string | null;
  retried_from: string | null;
  started_at: string;
  completed_at: string | null;
}

const STATUSES = ["all", "started", "launched", "completed", "failed", "cancelled", "retry_requested"] as const;

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed") return "destructive";
  if (s === "cancelled") return "outline";
  return "secondary";
}

export default function PersonaAttemptsAudit() {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [q, setQ] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("persona_verification_attempts")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(500);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    setLoading(false);
    if (error) { toast.error(`Failed to load attempts: ${error.message}`); return; }
    setRows((data ?? []) as unknown as AttemptRow[]);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const n = q.trim().toLowerCase();
    return rows.filter((r) =>
      [r.user_id, r.inquiry_id, r.subject_role, r.region, r.chosen_id_class, r.error_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(n)));
  }, [rows, q]);

  async function retry(row: AttemptRow) {
    setRetrying(row.id);
    const { data, error } = await supabase.functions.invoke("persona-retry-verification", {
      body: { attempt_id: row.id },
    });
    setRetrying(null);
    if (error) { toast.error(`Retry failed: ${error.message}`); return; }
    if (data?.error) { toast.error(String(data.error)); return; }
    toast.success(
      data?.provider_configured === false
        ? "Retry queued — Persona is not configured yet"
        : "New verification inquiry created and the user has been notified",
    );
    load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Verification attempts</CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search user id, inquiry id, role, region, ID class, error…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Chosen ID class</TableHead>
                <TableHead>Offered</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Inquiry</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    {r.retried_from && <Badge variant="outline" className="ml-1">retry</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{r.subject_role ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.region ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.chosen_id_class ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {(r.offered_id_classes ?? []).map((c) => c.code).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-mono text-xs">{r.inquiry_id ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate">
                    {r.result ?? r.error_code ?? "—"}
                    {r.error_detail ? ` — ${r.error_detail}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retry(r)}
                      disabled={retrying === r.id}
                    >
                      {retrying === r.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><RotateCcw className="h-4 w-4 mr-1" /> Retry</>}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : "No verification attempts recorded yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
