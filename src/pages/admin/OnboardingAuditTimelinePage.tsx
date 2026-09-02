import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Search, ClipboardList } from "lucide-react";

interface Row {
  id: string;
  user_id: string;
  actor_id: string | null;
  event_type: string;
  rpc_name: string | null;
  previous_stage: string | null;
  new_stage: string | null;
  previous_access_level: string | null;
  new_access_level: string | null;
  status: string;
  error_class: string | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  stage_changed: "default",
  access_changed: "secondary",
  rpc_call: "outline",
  rpc_error: "destructive",
};

const ERROR_CLASS_LABEL: Record<string, string> = {
  auth_missing: "Not signed in",
  permission_denied: "Permission denied",
  invalid_transition: "Invalid transition",
  schema_missing: "Schema missing",
  duplicate: "Duplicate",
  timeout: "Timeout",
  other: "Other error",
};

const PAGE_SIZE = 100;

export default function OnboardingAuditTimelinePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [errorClassFilter, setErrorClassFilter] = useState<string>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("onboarding_stage_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (eventFilter !== "all") query = query.eq("event_type", eventFilter);
    if (errorClassFilter !== "all") query = query.eq("error_class", errorClassFilter);
    if (debouncedQ) {
      // Match on user_id, actor_id, rpc_name, or error_message
      query = query.or(
        `user_id.eq.${debouncedQ},actor_id.eq.${debouncedQ},rpc_name.ilike.%${debouncedQ}%,error_message.ilike.%${debouncedQ}%`,
      );
    }

    const { data, error } = await query;
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, eventFilter, errorClassFilter]);

  useEffect(() => {
    const channel = supabase
      .channel("onboarding-audit-timeline")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "onboarding_stage_audit" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorCount = useMemo(() => rows.filter((r) => r.status === "error").length, [rows]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> Onboarding audit timeline
            </CardTitle>
            <CardDescription>
              Every stage change, access-level change, and RPC response for driver &amp; owner onboarding.
              {errorCount > 0 && (
                <span className="ml-2 text-destructive">· {errorCount} error{errorCount === 1 ? "" : "s"}</span>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search user id, actor id, rpc name, or error…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="stage_changed">Stage changed</SelectItem>
                <SelectItem value="access_changed">Access changed</SelectItem>
                <SelectItem value="rpc_call">RPC call</SelectItem>
                <SelectItem value="rpc_error">RPC error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={errorClassFilter} onValueChange={setErrorClassFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Error class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All error classes</SelectItem>
                {Object.entries(ERROR_CLASS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Stage / Access</TableHead>
                  <TableHead>RPC</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                  </TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    No onboarding events for these filters.
                  </TableCell></TableRow>
                )}
                {!loading && rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[140px]" title={r.user_id}>
                      {r.user_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[140px]" title={r.actor_id ?? ""}>
                      {r.actor_id ? `${r.actor_id.slice(0, 8)}…` : <span className="text-muted-foreground">self/system</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={EVENT_VARIANTS[r.event_type] ?? "outline"}>{r.event_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.previous_stage || r.new_stage ? (
                        <div>{r.previous_stage ?? "∅"} → <b>{r.new_stage ?? "∅"}</b></div>
                      ) : null}
                      {r.previous_access_level || r.new_access_level ? (
                        <div className="text-muted-foreground">
                          {r.previous_access_level ?? "∅"} → {r.new_access_level ?? "∅"}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.rpc_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.status === "ok" ? (
                        <Badge>OK</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="destructive">
                            {r.error_class ? ERROR_CLASS_LABEL[r.error_class] ?? r.error_class : "error"}
                          </Badge>
                          {r.error_message && (
                            <div className="text-muted-foreground max-w-[280px] truncate" title={r.error_message}>
                              {r.error_message}
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
