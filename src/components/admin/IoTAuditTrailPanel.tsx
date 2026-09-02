import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";

interface AuditRow {
  id: string;
  action: string;
  performed_by: string | null;
  sim_id: string | null;
  device_id: string | null;
  vehicle_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  /** Restrict feed by action prefix e.g. "hologram_" or "traccar_" */
  actionPrefix?: string;
  title?: string;
  description?: string;
  limit?: number;
}

export function IoTAuditTrailPanel({
  actionPrefix,
  title = "Admin audit trail",
  description = "Every change made from this dashboard is recorded with actor, time and target.",
  limit = 100,
}: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("iot_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (actionPrefix) q = q.like("action", `${actionPrefix}%`);
    const { data } = await q;
    const list = (data as AuditRow[]) || [];
    setRows(list);
    const ids = Array.from(new Set(list.map(r => r.performed_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, full_name, email").in("user_id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach(p => { map[p.user_id] = p.full_name || p.email || p.user_id; });
      setActors(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [actionPrefix]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admin actions recorded yet.</p>
        ) : (
          <ScrollArea className="h-[360px] pr-3">
            <ul className="space-y-2">
              {rows.map(r => (
                <li key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{r.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {r.performed_by ? (actors[r.performed_by] ?? r.performed_by.slice(0, 8)) : "system"}
                    </span>
                  </div>
                  {(r.sim_id || r.device_id || r.vehicle_id) && (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {r.sim_id && <span>sim: <code>{r.sim_id.slice(0, 8)}</code></span>}
                      {r.device_id && <span>device: <code>{r.device_id.slice(0, 8)}</code></span>}
                      {r.vehicle_id && <span>vehicle: <code>{r.vehicle_id.slice(0, 8)}</code></span>}
                    </div>
                  )}
                  {r.details && Object.keys(r.details).length > 0 && (
                    <pre className="mt-2 text-[11px] leading-tight bg-muted/40 rounded p-2 overflow-x-auto">
{JSON.stringify(r.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
