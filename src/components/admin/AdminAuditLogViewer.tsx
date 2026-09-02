import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Entry {
  id: string;
  admin_id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export default function AdminAuditLogViewer() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("admin_audit_log")
      .select("id, admin_id, action, target_table, target_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setEntries((data as Entry[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const actionTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (actionFilter !== "all" && e.action !== actionFilter) return false;
        if (userQuery && !e.admin_id.toLowerCase().includes(userQuery.toLowerCase())) return false;
        return true;
      }),
    [entries, actionFilter, userQuery],
  );

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Admin audit log
          <Badge variant="secondary">{filtered.length}</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Admin user ID contains…"
            value={userQuery}
            onChange={(e) => { setUserQuery(e.target.value); setPage(0); }}
          />
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Action type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actionTypes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-[380px] pr-2">
          {pageRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No entries.</p>
          ) : (
            <div className="space-y-2">
              {pageRows.map((e) => (
                <div key={e.id} className="border rounded p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{e.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.created_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <div>Admin: <code className="text-[11px]">{e.admin_id}</code></div>
                    {e.target_table && (
                      <div>Target: <code className="text-[11px]">{e.target_table}{e.target_id ? `#${e.target_id}` : ""}</code></div>
                    )}
                  </div>
                  {e.details && Object.keys(e.details).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                      <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto">
                        {JSON.stringify(e.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
