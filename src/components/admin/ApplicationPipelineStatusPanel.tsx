// Live status panel for an application's verification pipeline.
// Shows the latest attempt at notify-referees, verify-referees, and
// auto-submit-for-review with status badge, last message, and timestamp.
// Polls every 15s while the panel is open so admins see fresh data.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

type EventType = "notify_referees" | "verify_referees" | "auto_submit_for_review";
type EventStatus = "started" | "success" | "error";

interface Row {
  application_id: string;
  event_type: EventType;
  status: EventStatus;
  message: string | null;
  details: any;
  created_at: string;
}

const LABEL: Record<EventType, string> = {
  notify_referees: "Notify referees",
  verify_referees: "Verify referees",
  auto_submit_for_review: "Auto-submit for review",
};

const ORDER: EventType[] = ["auto_submit_for_review", "notify_referees", "verify_referees"];

function StatusBadge({ status }: { status: EventStatus }) {
  if (status === "success") {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Success
      </Badge>
    );
  }
  if (status === "error") {
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>;
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running
    </Badge>
  );
}

export default function ApplicationPipelineStatusPanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const { data } = await supabase
      .from("latest_application_pipeline_status" as any)
      .select("*")
      .eq("application_id", applicationId);
    setRows((data as any) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const map = new Map(rows.map((r) => [r.event_type, r] as const));

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="pipeline-status-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Verification pipeline status</h3>
        <Button size="sm" variant="ghost" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {ORDER.map((t) => {
            const r = map.get(t);
            return (
              <li key={t} className="border rounded-md p-3 text-sm" data-testid={`pipeline-row-${t}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{LABEL[t]}</span>
                  {r ? <StatusBadge status={r.status} /> : (
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Not run</Badge>
                  )}
                </div>
                {r ? (
                  <>
                    {r.message && (
                      <div className={r.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                        {r.message}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      {" · "}
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">No attempts recorded yet.</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
