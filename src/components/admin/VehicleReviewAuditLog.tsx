import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, HelpCircle, Eye, EyeOff, RefreshCw, Search, Download } from "lucide-react";

type ActionFilter = "all" | "published" | "rejected" | "needs_info" | "visibility";

interface AuditRow {
  id: string;
  vehicle_id: string;
  owner_id: string | null;
  actor_id: string | null;
  action: string;
  review_notes: string | null;
  new_values: Record<string, unknown> | null;
  batch_id: string | null;
  created_at: string;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Resolves the human-readable review decision behind an audit row. */
const decisionOf = (row: AuditRow): string => {
  if (row.action === "review_updated") {
    const status = (row.new_values?.review_status as string | undefined) ?? "";
    return status || "review_updated";
  }
  return row.action;
};

const DECISION_META: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  published: {
    label: "Published",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-500/15 text-red-700 dark:text-red-300",
    Icon: XCircle,
  },
  needs_info: {
    label: "Clarification requested",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    Icon: HelpCircle,
  },
  pending: {
    label: "Returned to pending",
    className: "bg-muted text-muted-foreground",
    Icon: HelpCircle,
  },
  made_public: {
    label: "Made public",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    Icon: Eye,
  },
  hidden: {
    label: "Hidden",
    className: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    Icon: EyeOff,
  },
};

const REVIEW_ACTIONS = ["published", "rejected", "review_updated", "made_public", "hidden"];

/**
 * Chronological log of every publish / reject / clarification and visibility
 * action taken on vehicle submissions, with the acting admin and timestamp.
 */
const VehicleReviewAuditLog = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActionFilter>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-vehicle-review-audit"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("vehicle_audit_log")
        .select("id, vehicle_id, owner_id, actor_id, action, review_notes, new_values, batch_id, created_at")
        .in("action", REVIEW_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const audit = (rows ?? []) as unknown as AuditRow[];
      const actorIds = [...new Set(audit.map((r) => r.actor_id).filter(Boolean))] as string[];
      const ownerIds = [...new Set(audit.map((r) => r.owner_id).filter(Boolean))] as string[];
      const vehicleIds = [...new Set(audit.map((r) => r.vehicle_id))];

      const [{ data: people }, { data: vehicles }] = await Promise.all([
        actorIds.length + ownerIds.length
          ? supabase
              .from("profiles")
              .select("user_id, full_name, email")
              .in("user_id", [...new Set([...actorIds, ...ownerIds])])
          : Promise.resolve({ data: [] as { user_id: string; full_name: string | null; email: string | null }[] }),
        vehicleIds.length
          ? supabase.from("vehicles").select("id, make, model, year, license_plate").in("id", vehicleIds)
          : Promise.resolve({ data: [] as { id: string; make: string | null; model: string | null; year: number | null; license_plate: string | null }[] }),
      ]);

      const peopleMap = new Map(
        (people ?? []).map((p) => [p.user_id, p.full_name?.trim() || p.email || "Unknown user"]),
      );
      const vehicleMap = new Map(
        (vehicles ?? []).map((v) => [
          v.id,
          [v.year, v.make, v.model].filter(Boolean).join(" ") +
            (v.license_plate ? ` · ${v.license_plate}` : ""),
        ]),
      );

      return audit.map((row) => ({
        ...row,
        actorName: row.actor_id ? peopleMap.get(row.actor_id) ?? "Unknown admin" : "System / automated",
        ownerName: row.owner_id ? peopleMap.get(row.owner_id) ?? "Unknown owner" : "—",
        vehicleLabel: vehicleMap.get(row.vehicle_id) ?? "Deleted vehicle",
        decision: decisionOf(row),
      }));
    },
  });

  const entries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (filter === "visibility" && !["made_public", "hidden"].includes(row.decision)) return false;
      if (filter !== "all" && filter !== "visibility" && row.decision !== filter) return false;
      if (!term) return true;
      return [row.actorName, row.ownerName, row.vehicleLabel, row.review_notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [data, search, filter]);

  const exportCsv = () => {
    const header = ["Timestamp", "Action", "Vehicle", "Owner", "Admin", "Bulk job", "Reason"];
    const lines = entries.map((row) =>
      [
        new Date(row.created_at).toISOString(),
        DECISION_META[row.decision]?.label ?? row.decision,
        row.vehicleLabel,
        row.ownerName,
        row.actorName,
        row.batch_id ?? "",
        (row.review_notes ?? "").replace(/\s+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicle-review-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Review audit log</CardTitle>
          <CardDescription>
            Every publish, rejection, clarification request and visibility change, with the admin who made it.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!entries.length}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search vehicle, owner, admin or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as ActionFilter)}>
            <SelectTrigger className="w-[14rem]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="needs_info">Clarification requested</SelectItem>
              <SelectItem value="visibility">Visibility changes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No review actions recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((row) => {
              const meta = DECISION_META[row.decision] ?? {
                label: row.decision.replace(/_/g, " "),
                className: "bg-muted text-muted-foreground",
                Icon: HelpCircle,
              };
              const Icon = meta.Icon;
              return (
                <li key={row.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={meta.className}>
                        <Icon className="mr-1 h-3.5 w-3.5" />
                        {meta.label}
                      </Badge>
                      <span className="text-sm font-medium">{row.vehicleLabel}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    By <span className="font-medium text-foreground">{row.actorName}</span> · Owner:{" "}
                    {row.ownerName}
                  </p>
                  {row.batch_id && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Part of bulk job{" "}
                      <span className="font-mono text-foreground">{row.batch_id.slice(0, 8)}</span>
                    </p>
                  )}
                  {row.review_notes && (
                    <p className="mt-2 rounded-md bg-muted/60 p-2 text-xs">{row.review_notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default VehicleReviewAuditLog;
