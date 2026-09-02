import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";

type OutboxRow = {
  id: string;
  recipient_id: string;
  channel: string;
  category: string;
  kind: string;
  title: string;
  body: string | null;
  source_table: string | null;
  record_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
};

const STATUS_TABS = ["failed", "skipped", "pending", "sent"] as const;

const statusVariant = (status: string) =>
  status === "failed"
    ? "bg-destructive/15 text-destructive"
    : status === "sent"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "skipped"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";

export default function AdminNotificationRetryPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("failed");
  const [recordFilter, setRecordFilter] = useState("");
  const [appliedRecord, setAppliedRecord] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notification-outbox", status, appliedRecord],
    queryFn: async () => {
      let q = supabase
        .from("event_notification_outbox")
        .select(
          "id, recipient_id, channel, category, kind, title, body, source_table, record_id, status, attempts, last_error, created_at, delivered_at",
        )
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(200);
      if (appliedRecord.trim()) q = q.eq("record_id", appliedRecord.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OutboxRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const retryable = status === "failed" || status === "skipped";

  const retry = useMutation({
    mutationFn: async (payload: { ids?: string[]; record_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("retry-event-notifications", {
        body: payload,
      });
      if (error) throw error;
      if ((data as { error?: unknown })?.error) {
        throw new Error(JSON.stringify((data as { error: unknown }).error));
      }
      return data as { requeued_count: number };
    },
    onSuccess: (res) => {
      toast.success(
        res.requeued_count > 0
          ? `Re-queued ${res.requeued_count} notification${res.requeued_count === 1 ? "" : "s"} and re-ran delivery.`
          : "Nothing to retry for that selection.",
      );
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["notification-outbox"] });
    },
    onError: (e: Error) => toast.error(e.message || "Retry failed"),
  });

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Seo
        title="Notification Retry | Rentmaikar Admin"
        description="Review failed notification deliveries and reprocess them for a specific event run or vehicle submission."
        path="/admin/notification-retry"
        noindex
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notification retry</h1>
        <p className="text-sm text-muted-foreground">
          Reprocess failed or skipped notification deliveries for an event run or a specific
          vehicle submission.
        </p>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Delivery outbox</CardTitle>
              <CardDescription>Latest 200 entries per status.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["notification-outbox"] })}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Tabs value={status} onValueChange={(v) => { setStatus(v); setSelected([]); }}>
            <TabsList>
              {STATUS_TABS.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={recordFilter}
                onChange={(e) => setRecordFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setAppliedRecord(recordFilter)}
                placeholder="Filter by record ID (vehicle, invoice, application…)"
                className="pl-8"
                aria-label="Record ID"
              />
            </div>
            <Button variant="secondary" onClick={() => setAppliedRecord(recordFilter)}>
              Apply
            </Button>
            {appliedRecord && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRecordFilter("");
                    setAppliedRecord("");
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={() => retry.mutate({ record_id: appliedRecord.trim() })}
                  disabled={retry.isPending}
                >
                  {retry.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Retry all for this record
                </Button>
              </>
            )}
          </div>

          {retryable && rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) => setSelected(c ? rows.map((r) => r.id) : [])}
                aria-label="Select all"
              />
              <span className="text-sm text-muted-foreground">
                {selected.length} selected
              </span>
              <Button
                size="sm"
                disabled={selected.length === 0 || retry.isPending}
                onClick={() => retry.mutate({ ids: selected })}
              >
                {retry.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Retry selected
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {status} deliveries{appliedRecord ? " for that record" : ""}.
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start gap-3">
                  {retryable && (
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(r.id)}
                      onCheckedChange={(c) =>
                        setSelected((prev) =>
                          c ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                        )
                      }
                      aria-label={`Select ${r.title}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={statusVariant(r.status)}>
                        {r.status}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {r.channel}
                      </Badge>
                      <Badge variant="outline">{r.category}</Badge>
                      <span className="text-xs text-muted-foreground">
                        attempts: {r.attempts}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-medium">{r.title}</div>
                    {r.body && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {r.body}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {r.source_table ?? "—"} · record {r.record_id ?? "—"} ·{" "}
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    {r.last_error && (
                      <div className="mt-1 break-words rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                        {r.last_error}
                      </div>
                    )}
                  </div>
                  {retryable && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate({ ids: [r.id] })}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
