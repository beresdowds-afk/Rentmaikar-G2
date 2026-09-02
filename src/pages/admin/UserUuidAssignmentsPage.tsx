import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, Fingerprint, Download } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  user_id: string;
  public_uuid: string;
  role: string;
  source: string;
  assigned_by: string | null;
  assigned_at: string;
  metadata: Record<string, unknown> | null;
}

const ROLES = ["admin", "admin_assistant", "owner", "driver"];

export default function UserUuidAssignmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [source, setSource] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_uuid_assignments")
      .select("*")
      .order("assigned_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("user_uuid_assignments_watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_uuid_assignments" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const sources = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => r.source && s.add(r.source));
    return Array.from(s);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (role !== "all" && r.role !== role) return false;
      if (source !== "all" && r.source !== source) return false;
      if (!needle) return true;
      return (
        r.user_id.toLowerCase().includes(needle) ||
        r.public_uuid.toLowerCase().includes(needle) ||
        (r.assigned_by ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, role, source]);

  const exportCsv = () => {
    const header = ["assigned_at", "role", "user_id", "public_uuid", "source", "assigned_by"];
    const csv = [
      header.join(","),
      ...filtered.map(r => [
        r.assigned_at,
        r.role,
        r.user_id,
        r.public_uuid,
        r.source,
        r.assigned_by ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user_uuid_assignments_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              User UUID Assignments
            </CardTitle>
            <CardDescription>
              Audit trail of public UUIDs minted by the UUID worker for all existing and newly
              registered users (admins, admin assistants, owners, drivers). Updates in realtime.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by user id, public uuid, or assigned_by…"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assigned at</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Public UUID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Assigned by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No assignments found</TableCell></TableRow>
                ) : (
                  filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.assigned_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{r.role}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.public_uuid}</TableCell>
                      <TableCell><Badge variant="secondary">{r.source}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.assigned_by ?? "system"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="text-xs text-muted-foreground">Showing {filtered.length} of {rows.length} records (most recent 500).</div>
        </CardContent>
      </Card>
    </div>
  );
}
