import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  RefreshCw,
  Search,
  PowerOff,
  Power,
  Download,
  Shield,
  Eye,
  RotateCw,
  Radio,
} from "lucide-react";
import { toast } from "sonner";

interface AuditRow {
  id: string;
  performed_by: string | null;
  action: string;
  device_id: string | null;
  vehicle_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

interface EnrichedRow extends AuditRow {
  actor_email: string | null;
  vehicle_label: string | null;
  device_serial: string | null;
  traccar_device_id: number | null;
  command: string;
  response_ok: boolean | null;
  response_status: number | null;
  response_body: unknown;
  request_payload: unknown;
}

const COMMAND_LABEL: Record<string, { label: string; icon: JSX.Element; variant: "destructive" | "default" }> = {
  engineStop: { label: "Immobilize", icon: <PowerOff className="h-3 w-3" />, variant: "destructive" },
  engineResume: { label: "Mobilize", icon: <Power className="h-3 w-3" />, variant: "default" },
};

const PAGE_SIZE = 50;

type Filter = "all" | "engineStop" | "engineResume" | "success" | "failure";

export default function TraccarCommandAuditPage() {
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<EnrichedRow | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmReplayOne, setConfirmReplayOne] = useState<EnrichedRow | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "off">("connecting");
  const [newRowsSinceView, setNewRowsSinceView] = useState(0);
  // Per-row inline replay state (running/success/failed/rate-limited)
  type ReplayState = {
    status: "running" | "success" | "failed" | "rate_limited";
    message?: string;
    at: number;
  };
  const [replayStates, setReplayStates] = useState<Record<string, ReplayState>>({});
  // 429 friendly handler
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!rateLimitedUntil) return;
    const t = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(t);
  }, [rateLimitedUntil]);
  const rateLimitRemainingSec =
    rateLimitedUntil && rateLimitedUntil > nowTs
      ? Math.ceil((rateLimitedUntil - nowTs) / 1000)
      : 0;
  const isRateLimited = rateLimitRemainingSec > 0;
  useEffect(() => {
    if (rateLimitedUntil && rateLimitedUntil <= nowTs) setRateLimitedUntil(null);
  }, [nowTs, rateLimitedUntil]);
  const loadRef = useRef<() => void>(() => {});


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [debouncedQ, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("iot_audit_log")
      .select("*", { count: "exact" })
      .like("action", "traccar_command_%")
      .order("created_at", { ascending: false });

    // Server-side command filter
    if (filter === "engineStop") query = query.eq("action", "traccar_command_engineStop");
    else if (filter === "engineResume") query = query.eq("action", "traccar_command_engineResume");
    // Success / failure lives inside details JSON — filter server-side via JSON key.
    if (filter === "success") query = query.eq("details->>ok", "true");
    else if (filter === "failure") query = query.eq("details->>ok", "false");

    // Server-side text search across serial/device_id inside JSON details.
    if (debouncedQ) {
      const like = `%${debouncedQ}%`;
      query = query.or(
        `details->>serial_number.ilike.${like},details->>traccar_device_id.ilike.${like},details->>command.ilike.${like}`,
      );
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const base = (data ?? []) as AuditRow[];
    setTotal(count ?? 0);

    const actorIds = Array.from(new Set(base.map((r) => r.performed_by).filter(Boolean))) as string[];
    const vehicleIds = Array.from(new Set(base.map((r) => r.vehicle_id).filter(Boolean))) as string[];
    const deviceIds = Array.from(new Set(base.map((r) => r.device_id).filter(Boolean))) as string[];

    const [profilesRes, vehiclesRes, devicesRes] = await Promise.all([
      actorIds.length
        ? supabase.from("profiles").select("id, email, full_name").in("id", actorIds)
        : Promise.resolve({ data: [] as any[] }),
      vehicleIds.length
        ? supabase.from("vehicles").select("id, make, model, license_plate").in("id", vehicleIds)
        : Promise.resolve({ data: [] as any[] }),
      deviceIds.length
        ? supabase.from("iot_devices").select("id, serial_number").in("id", deviceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const vehicleMap = new Map((vehiclesRes.data ?? []).map((v: any) => [v.id, v]));
    const deviceMap = new Map((devicesRes.data ?? []).map((d: any) => [d.id, d]));

    const enriched: EnrichedRow[] = base.map((r) => {
      const command = r.action.replace(/^traccar_command_/, "");
      const details = r.details ?? {};
      const response = (details.response ?? {}) as any;
      const p = r.performed_by ? profileMap.get(r.performed_by) : null;
      const v = r.vehicle_id ? vehicleMap.get(r.vehicle_id) : null;
      const d = r.device_id ? deviceMap.get(r.device_id) : null;
      return {
        ...r,
        command,
        response_ok: typeof response.ok === "boolean" ? response.ok : (details.ok ?? null),
        response_status: response.status ?? null,
        response_body: response.body ?? response ?? null,
        request_payload:
          details.request ?? {
            payload: {
              deviceId: details.traccar_device_id ?? null,
              type: command,
              attributes: details.attributes ?? {},
            },
          },
        actor_email: p ? p.email ?? p.full_name ?? null : null,
        vehicle_label: v
          ? `${v.make ?? ""} ${v.model ?? ""} · ${v.license_plate ?? ""}`.trim()
          : null,
        device_serial: d?.serial_number ?? details.serial_number ?? null,
        traccar_device_id: details.traccar_device_id ?? null,
      };
    });
    setRows(enriched);
    setLoading(false);
  }, [debouncedQ, filter, page]);

  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);

  // Realtime: append/update rows as new traccar command audit entries land.
  useEffect(() => {
    setRealtimeStatus("connecting");
    const channel = supabase
      .channel("traccar-audit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "iot_audit_log" },
        (payload) => {
          const row = payload.new as AuditRow;
          if (!row?.action?.startsWith("traccar_command_")) return;
          // Only reload if we're on page 0 with no active text-search so counts stay accurate.
          if (page === 0 && !debouncedQ) {
            loadRef.current();
          } else {
            setNewRowsSinceView((n) => n + 1);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("live");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setRealtimeStatus("off");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [page, debouncedQ]);

  // Reset "new rows" badge whenever we complete a fresh load.
  useEffect(() => {
    if (!loading) setNewRowsSinceView(0);
  }, [loading, rows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    const header = [
      "timestamp",
      "actor",
      "command",
      "vehicle",
      "device_serial",
      "traccar_device_id",
      "ok",
      "status",
      "response",
    ];
    const lines = [header.join(",")].concat(
      rows.map((r) =>
        [
          r.created_at,
          r.actor_email ?? r.performed_by ?? "",
          r.command,
          r.vehicle_label ?? r.vehicle_id ?? "",
          r.device_serial ?? "",
          r.traccar_device_id ?? "",
          r.response_ok ?? "",
          r.response_status ?? "",
          JSON.stringify(r.response_body ?? {}),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traccar-commands-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendReplay = async (r: EnrichedRow) => {
    const attrs = ((r.details?.attributes ?? {}) as Record<string, unknown>) || {};
    const { data, error } = await supabase.functions.invoke("traccar-admin", {
      body: {
        action: "send_command",
        device_id: r.traccar_device_id,
        command: r.command,
        attributes: { ...attrs, __replay_of: r.id },
      },
    });
    if (error) throw error;
    return data as { ok?: boolean; body?: any; error?: string; retry_after_seconds?: number } | null;
  };

  const applyRateLimit = (retryAfterSec: number | undefined) => {
    const secs = Math.max(1, Math.min(300, retryAfterSec ?? 30));
    setRateLimitedUntil(Date.now() + secs * 1000);
  };

  const replay = async (r: EnrichedRow) => {
    if (!r.traccar_device_id || !r.command) {
      toast.error("Cannot replay: missing traccar device id or command");
      return;
    }
    if (isRateLimited) {
      toast.error(`Rate-limited — retry in ${rateLimitRemainingSec}s`);
      return;
    }
    setReplayingId(r.id);
    setReplayStates((s) => ({ ...s, [r.id]: { status: "running", at: Date.now() } }));
    try {
      const data = await sendReplay(r);
      if (data?.error === "rate_limited") {
        applyRateLimit(data.retry_after_seconds);
        setReplayStates((s) => ({
          ...s,
          [r.id]: {
            status: "rate_limited",
            message: `Retry in ~${data.retry_after_seconds ?? 30}s`,
            at: Date.now(),
          },
        }));
        toast.error(`Rate limit hit. Retry in ~${data.retry_after_seconds ?? 30}s`);
      } else if (data?.ok) {
        setReplayStates((s) => ({
          ...s,
          [r.id]: { status: "success", message: "Replayed OK", at: Date.now() },
        }));
        toast.success(`Replayed ${r.command} · new attempt logged`);
      } else {
        const msg = (data as any)?.body?.message ?? (data as any)?.error ?? "provider error";
        setReplayStates((s) => ({
          ...s,
          [r.id]: { status: "failed", message: String(msg), at: Date.now() },
        }));
        toast.error(`Replay failed: ${msg}`);
      }
      await load();
    } catch (e: any) {
      setReplayStates((s) => ({
        ...s,
        [r.id]: { status: "failed", message: e?.message ?? "error", at: Date.now() },
      }));
      toast.error(e?.message ?? "Replay failed");
    } finally {
      setReplayingId(null);
    }
  };

  const failedSelected = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id) && r.response_ok === false && r.traccar_device_id),
    [rows, selectedIds],
  );

  const bulkReplay = async () => {
    if (failedSelected.length === 0) return;
    if (isRateLimited) {
      toast.error(`Rate-limited — retry in ${rateLimitRemainingSec}s`);
      return;
    }
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: failedSelected.length });
    let ok = 0;
    let failed = 0;
    let rateLimited = 0;
    for (let i = 0; i < failedSelected.length; i++) {
      const r = failedSelected[i];
      setReplayStates((s) => ({ ...s, [r.id]: { status: "running", at: Date.now() } }));
      try {
        const data = await sendReplay(r);
        if (data?.error === "rate_limited") {
          rateLimited++;
          applyRateLimit(data.retry_after_seconds);
          setReplayStates((s) => ({
            ...s,
            [r.id]: {
              status: "rate_limited",
              message: `Retry in ~${data.retry_after_seconds ?? 30}s`,
              at: Date.now(),
            },
          }));
          setBulkProgress({ done: i + 1, total: failedSelected.length });
          // Stop the batch — server won't accept more this window.
          break;
        } else if (data?.ok) {
          ok++;
          setReplayStates((s) => ({
            ...s,
            [r.id]: { status: "success", message: "Replayed OK", at: Date.now() },
          }));
        } else {
          failed++;
          const msg = (data as any)?.body?.message ?? (data as any)?.error ?? "provider error";
          setReplayStates((s) => ({
            ...s,
            [r.id]: { status: "failed", message: String(msg), at: Date.now() },
          }));
        }
      } catch (e: any) {
        failed++;
        setReplayStates((s) => ({
          ...s,
          [r.id]: { status: "failed", message: e?.message ?? "error", at: Date.now() },
        }));
      }
      setBulkProgress({ done: i + 1, total: failedSelected.length });
      await new Promise((res) => setTimeout(res, 250));
    }
    setBulkRunning(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    toast.message("Bulk replay complete", {
      description: `${ok} ok · ${failed} failed${rateLimited ? ` · ${rateLimited} rate-limited (paused)` : ""}`,
    });
    await load();
  };


  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const failedOnPage = useMemo(
    () => rows.filter((r) => r.response_ok === false && !!r.traccar_device_id),
    [rows],
  );
  const allFailedSelected =
    failedOnPage.length > 0 && failedOnPage.every((r) => selectedIds.has(r.id));
  const toggleAllFailed = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      failedOnPage.forEach((r) => {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
  };

  // ---- Bulk selection helpers: device / command / time window ----
  const failedRows = useMemo(
    () => rows.filter((r) => r.response_ok === false && !!r.traccar_device_id),
    [rows],
  );
  const failedDevices = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    failedRows.forEach((r) => {
      const key = String(r.traccar_device_id);
      const label = r.device_serial ?? `Traccar ${r.traccar_device_id}`;
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { id: key, label, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [failedRows]);
  const [bulkDevice, setBulkDevice] = useState<string>("all");
  const [bulkCommand, setBulkCommand] = useState<string>("all");
  const [bulkWindow, setBulkWindow] = useState<string>("all");

  const selectFailedMatching = () => {
    const now = Date.now();
    const windowMs =
      bulkWindow === "15m" ? 15 * 60_000 :
      bulkWindow === "1h" ? 60 * 60_000 :
      bulkWindow === "24h" ? 24 * 60 * 60_000 :
      bulkWindow === "7d" ? 7 * 24 * 60 * 60_000 : null;

    const matches = failedRows.filter((r) => {
      if (bulkDevice !== "all" && String(r.traccar_device_id) !== bulkDevice) return false;
      if (bulkCommand !== "all" && r.command !== bulkCommand) return false;
      if (windowMs != null && now - new Date(r.created_at).getTime() > windowMs) return false;
      return true;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      matches.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const matchingCount = useMemo(() => {
    const now = Date.now();
    const windowMs =
      bulkWindow === "15m" ? 15 * 60_000 :
      bulkWindow === "1h" ? 60 * 60_000 :
      bulkWindow === "24h" ? 24 * 60 * 60_000 :
      bulkWindow === "7d" ? 7 * 24 * 60 * 60_000 : null;
    return failedRows.filter((r) => {
      if (bulkDevice !== "all" && String(r.traccar_device_id) !== bulkDevice) return false;
      if (bulkCommand !== "all" && r.command !== bulkCommand) return false;
      if (windowMs != null && now - new Date(r.created_at).getTime() > windowMs) return false;
      return true;
    }).length;
  }, [failedRows, bulkDevice, bulkCommand, bulkWindow]);

  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, page * PAGE_SIZE + rows.length);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> Traccar Command Audit
            </CardTitle>
            <CardDescription>
              Every Immobilize / Mobilize command sent from the Live Map, with actor, timestamp,
              device id and full Traccar request/response payloads.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={realtimeStatus === "live" ? "default" : "secondary"}
              className="gap-1"
              title={
                realtimeStatus === "live"
                  ? "Live: new commands appear automatically"
                  : realtimeStatus === "connecting"
                  ? "Connecting to realtime…"
                  : "Realtime offline — use Refresh"
              }
            >
              <Radio
                className={`h-3 w-3 ${
                  realtimeStatus === "live" ? "text-emerald-500 animate-pulse" : ""
                }`}
              />
              {realtimeStatus === "live" ? "Live" : realtimeStatus}
            </Badge>
            {newRowsSinceView > 0 && (
              <Button variant="secondary" size="sm" onClick={load}>
                {newRowsSinceView} new · show
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isRateLimited && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  Traccar rate limit reached — pausing replays for{" "}
                  <span className="font-mono font-semibold">{rateLimitRemainingSec}s</span>.
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Buttons re-enable automatically.</span>
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{selectedIds.size}</span> selected ·{" "}
                <span className="text-muted-foreground">
                  {failedSelected.length} replayable failure{failedSelected.length === 1 ? "" : "s"}
                </span>
                {bulkProgress && (
                  <span className="ml-2 text-muted-foreground">
                    · replaying {bulkProgress.done}/{bulkProgress.total}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  disabled={failedSelected.length === 0 || bulkRunning || isRateLimited}
                  onClick={() => setConfirmBulk(true)}
                  title={isRateLimited ? `Rate-limited — retry in ${rateLimitRemainingSec}s` : undefined}
                >
                  {bulkRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RotateCw className="h-4 w-4 mr-1" />
                  )}
                  {isRateLimited
                    ? `Wait ${rateLimitRemainingSec}s`
                    : `Replay ${failedSelected.length} failure${failedSelected.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}



          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search serial, traccar device id, or command…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All commands</SelectItem>
                <SelectItem value="engineStop">Immobilize only</SelectItem>
                <SelectItem value="engineResume">Mobilize only</SelectItem>
                <SelectItem value="success">Success only</SelectItem>
                <SelectItem value="failure">Failures only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {failedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm">
              <span className="text-muted-foreground">Bulk-select failed by:</span>
              <Select value={bulkDevice} onValueChange={setBulkDevice}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Device" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any device</SelectItem>
                  {failedDevices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label} · {d.count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bulkCommand} onValueChange={setBulkCommand}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Command" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any command</SelectItem>
                  <SelectItem value="engineStop">Immobilize</SelectItem>
                  <SelectItem value="engineResume">Mobilize</SelectItem>
                </SelectContent>
              </Select>
              <Select value={bulkWindow} onValueChange={setBulkWindow}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Time window" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any time</SelectItem>
                  <SelectItem value="15m">Last 15 minutes</SelectItem>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={matchingCount === 0}
                onClick={selectFailedMatching}
              >
                Select {matchingCount} matching failure{matchingCount === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allFailedSelected && failedOnPage.length > 0}
                      onCheckedChange={(v) => toggleAllFailed(!!v)}
                      disabled={failedOnPage.length === 0}
                      aria-label="Select all failed on this page"
                    />
                  </TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      No commands recorded for these filters.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((r) => {
                    const meta = COMMAND_LABEL[r.command] ?? {
                      label: r.command,
                      icon: <Shield className="h-3 w-3" />,
                      variant: "default" as const,
                    };
                    const isFailure = r.response_ok === false;
                    return (
                      <TableRow key={r.id} data-state={selectedIds.has(r.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={(v) => toggleRow(r.id, !!v)}
                            disabled={!isFailure || !r.traccar_device_id}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.actor_email ?? (
                            <span className="text-muted-foreground">{r.performed_by ?? "system"}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.variant} className="gap-1">
                            {meta.icon}
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.vehicle_label ?? (
                            <span className="text-muted-foreground">
                              {r.vehicle_id ?? "unlinked"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{r.device_serial ?? "—"}</div>
                          {r.traccar_device_id != null && (
                            <div className="text-muted-foreground">
                              Traccar ID: {r.traccar_device_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-1">
                            {r.response_ok === true ? (
                              <Badge>OK{r.response_status ? ` · ${r.response_status}` : ""}</Badge>
                            ) : isFailure ? (
                              <Badge variant="destructive">
                                FAIL{r.response_status ? ` · ${r.response_status}` : ""}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">unknown</Badge>
                            )}
                            {(() => {
                              const rs = replayStates[r.id];
                              if (!rs) return null;
                              if (rs.status === "running")
                                return (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" /> replaying…
                                  </span>
                                );
                              if (rs.status === "success")
                                return (
                                  <Badge variant="secondary" className="w-fit bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px]">
                                    replay ok
                                  </Badge>
                                );
                              if (rs.status === "rate_limited")
                                return (
                                  <span className="text-[10px] text-amber-700 dark:text-amber-300" title={rs.message}>
                                    rate-limited
                                  </span>
                                );
                              return (
                                <span className="text-[10px] text-destructive truncate max-w-[200px]" title={rs.message}>
                                  replay failed{rs.message ? `: ${rs.message}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelected(r)}
                              title="View request/response"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {isFailure && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={replayingId === r.id || !r.traccar_device_id || isRateLimited}
                                onClick={() => setConfirmReplayOne(r)}
                                title={
                                  isRateLimited
                                    ? `Rate-limited — retry in ${rateLimitRemainingSec}s`
                                    : "Re-issue this command"
                                }
                              >
                                {replayingId === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <RotateCw className="h-4 w-4 mr-1" />
                                    {isRateLimited ? `${rateLimitRemainingSec}s` : "Replay"}
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>

                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing {showingFrom}–{showingTo} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                Previous
              </Button>
              <span>
                Page {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Command details</DialogTitle>
            <DialogDescription>
              Full Traccar request payload and server response for troubleshooting.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">When</div>
                  <div>{new Date(selected.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Admin</div>
                  <div>{selected.actor_email ?? selected.performed_by ?? "system"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Command</div>
                  <div>{selected.command}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Traccar device id</div>
                  <div>{selected.traccar_device_id ?? "—"}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1">Request payload</div>
                <pre className="text-[11px] bg-muted rounded p-3 overflow-auto max-h-64">
{JSON.stringify(selected.request_payload, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs font-medium mb-1">Response body</div>
                <pre className="text-[11px] bg-muted rounded p-3 overflow-auto max-h-64">
{JSON.stringify(selected.response_body, null, 2)}
                </pre>
              </div>
              {selected.response_ok === false && (
                <div className="flex justify-end">
                  <Button
                    variant="default"
                    disabled={replayingId === selected.id || !selected.traccar_device_id}
                    onClick={() => setConfirmReplayOne(selected)}
                  >
                    {replayingId === selected.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RotateCw className="h-4 w-4 mr-1" />
                    )}
                    Replay command
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmReplayOne}
        onOpenChange={(o) => !o && setConfirmReplayOne(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replay{" "}
              {confirmReplayOne
                ? COMMAND_LABEL[confirmReplayOne.command]?.label ?? confirmReplayOne.command
                : ""}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This re-issues the exact same command to Traccar device{" "}
              <span className="font-mono">{confirmReplayOne?.traccar_device_id}</span>. A new audit
              entry will be recorded. Server-side rate limit: 20 commands per admin per minute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const r = confirmReplayOne;
                setConfirmReplayOne(null);
                if (r) replay(r);
              }}
            >
              Yes, replay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay {failedSelected.length} failed commands?</AlertDialogTitle>
            <AlertDialogDescription>
              Each selected failure will be re-issued to Traccar in order and logged as a new audit
              entry. The server enforces a 20/min per-admin rate limit; if it kicks in the run
              pauses automatically. You cannot undo issued commands.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBulk(false);
                bulkReplay();
              }}
            >
              Yes, replay {failedSelected.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
