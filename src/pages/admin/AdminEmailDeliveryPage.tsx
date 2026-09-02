import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Loader2, MailCheck, MailX, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";

type SendLogRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type SuppressedRow = {
  id: string;
  email: string;
  reason: string;
  created_at: string;
};

const STATUS_TABS = ["all", "pending", "sent", "failed", "dlq", "bounced", "complained", "suppressed"] as const;

type QueueStats = Record<string, number>;

type DlqRetryRow = {
  id: string;
  queue_name: string;
  message_key: string;
  recipient_email: string | null;
  template_name: string | null;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  paused: boolean;
};

type ProviderAlertRow = {
  id: string;
  function_name: string;
  status: number;
  recipient_email: string | null;
  subject: string | null;
  provider_response: string | null;
  created_at: string;
};

const statusVariant = (status: string) => {
  switch (status) {
    case "sent":
    case "delivered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "failed":
    case "bounced":
      return "bg-destructive/15 text-destructive";
    case "complained":
    case "suppressed":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function AdminEmailDeliveryPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const { data: rows, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["email-send-log", status, appliedSearch],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (status !== "all") q = q.eq("status", status);
      if (appliedSearch.trim()) q = q.ilike("recipient_email", `%${appliedSearch.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SendLogRow[];
    },
  });

  const { data: suppressed } = useQuery({
    queryKey: ["suppressed-emails"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppressed_emails")
        .select("id, email, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SuppressedRow[];
    },
  });

  // Unfiltered 24h window so the summary cards never depend on the active tab.
  const { data: recentAll } = useQuery({
    queryKey: ["email-send-log-24h"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("email_send_log")
        .select("status")
        .gte("created_at", since)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as { status: string }[];
    },
  });

  // Live queue depths (queued + dead-lettered) straight from the queues.
  const { data: queueStats } = useQuery({
    queryKey: ["email-queue-stats"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("email_queue_stats");
      if (error) throw error;
      return (data ?? {}) as QueueStats;
    },
  });

  const { data: dlqRetries } = useQuery({
    queryKey: ["email-dlq-retry-state"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_dlq_retry_state")
        .select("id, queue_name, message_key, recipient_email, template_name, attempts, last_error, next_attempt_at, paused")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DlqRetryRow[];
    },
  });

  const { data: providerAlerts } = useQuery({
    queryKey: ["email-provider-alerts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_provider_alerts")
        .select("id, function_name, status, recipient_email, subject, provider_response, created_at")
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ProviderAlertRow[];
    },
  });

  const [retrying, setRetrying] = useState(false);

  const runDlqRetry = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("reprocess-email-dlq", { body: {} });
      if (error) throw error;
      const res = data as { requeued?: number; paused?: number; skipped?: boolean } | null;
      if (res?.skipped) toast.info("A retry sweep is already running.");
      else toast.success(`Requeued ${res?.requeued ?? 0} message(s); ${res?.paused ?? 0} paused.`);
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["email-dlq-retry-state"] });
      queryClient.invalidateQueries({ queryKey: ["email-send-log"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry sweep failed");
    } finally {
      setRetrying(false);
    }
  };

  const acknowledgeAlert = async (id: string) => {
    const { error } = await supabase
      .from("email_provider_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["email-provider-alerts"] });
  };


  // Realtime: refresh as soon as the queue worker or webhooks write outcomes.
  useEffect(() => {
    const channel = supabase
      .channel("admin-email-delivery-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_send_log" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["email-send-log"] });
          const status = (payload.new as { status?: string })?.status;
          if (status === "bounced" || status === "complained" || status === "failed") {
            toast.warning(`Email ${status}`, {
              description: (payload.new as { recipient_email?: string })?.recipient_email,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suppressed_emails" },
        () => queryClient.invalidateQueries({ queryKey: ["suppressed-emails"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const stats = useMemo(() => {
    const by = (s: string) => (recentAll ?? []).filter((r) => r.status === s).length;
    return {
      sent: by("sent") + by("delivered"),
      pending: by("pending"),
      failed: by("failed") + by("bounced"),
      dlq: by("dlq"),
      suppressed: (suppressed ?? []).length,
      queued:
        (queueStats?.auth_emails ?? 0) + (queueStats?.transactional_emails ?? 0),
      dlqQueued:
        (queueStats?.auth_emails_dlq ?? 0) + (queueStats?.transactional_emails_dlq ?? 0),
    };
  }, [recentAll, suppressed, queueStats]);


  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Seo
        title="Email Delivery Monitor | Rentmaikar Admin"
        description="Real-time delivery status, bounces, complaints, and unsubscribes for app emails."
        path="/admin/email-delivery"
        noindex
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Email delivery monitor</h1>
        <p className="text-sm text-muted-foreground">
          Live outcomes for every app email — queued, sent, failed, bounced, complained, and
          unsubscribed. Updates in real time.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <MailCheck className="h-4 w-4" /> Sent (24h)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.sent}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4" /> Pending (24h)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> Failed/Bounced (24h)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.failed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <MailX className="h-4 w-4" /> Suppressed (total)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.suppressed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4" /> In queue (now)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.queued}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <MailX className="h-4 w-4" /> Dead-letter (now)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.dlqQueued}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> DLQ events (24h)
            </CardDescription>
            <CardTitle className="text-2xl">{stats.dlq}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {(providerAlerts ?? []).length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Provider authorization failures
            </CardTitle>
            <CardDescription>
              Resend rejected these sends with 401/403 — the key or sender domain needs attention.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(providerAlerts ?? []).map((a) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                      {a.status}
                    </Badge>
                    <Badge variant="outline">{a.function_name}</Badge>
                    <span className="min-w-0 flex-1 truncate">{a.recipient_email ?? "—"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(a.id)}>
                      Acknowledge
                    </Button>
                  </div>
                  {a.subject && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Subject: {a.subject}</p>
                  )}
                  {a.provider_response && (
                    <div className="mt-1 break-words rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                      {a.provider_response.slice(0, 400)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Dead-letter retries</CardTitle>
              <CardDescription>
                Automatic exponential-backoff retries. Entries pause after 5 attempts and alert the
                team.
              </CardDescription>
            </div>
            <Button size="sm" onClick={runDlqRetry} disabled={retrying}>
              <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              Retry now
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(dlqRetries ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No dead-letter retries recorded.
            </p>
          ) : (
            <ul className="space-y-2">
              {(dlqRetries ?? []).map((d) => (
                <li key={d.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={d.paused ? "bg-destructive/15 text-destructive" : "bg-muted"}
                    >
                      {d.paused ? "paused" : `attempt ${d.attempts}`}
                    </Badge>
                    <Badge variant="outline">{d.template_name ?? d.queue_name}</Badge>
                    <span className="min-w-0 flex-1 truncate">{d.recipient_email ?? "—"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      next {new Date(d.next_attempt_at).toLocaleString()}
                    </span>
                  </div>
                  {d.last_error && (
                    <div className="mt-1 break-words rounded bg-muted p-2 text-[11px]">
                      {d.last_error}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Delivery log</CardTitle>
              <CardDescription>
                Latest 300 events · updated {new Date(dataUpdatedAt).toLocaleTimeString()}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["email-send-log"] });
                queryClient.invalidateQueries({ queryKey: ["suppressed-emails"] });
              }}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="flex-wrap">
              {STATUS_TABS.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(search)}
                placeholder="Filter by recipient email"
                className="pl-8"
                aria-label="Recipient email"
              />
            </div>
            <Button variant="secondary" onClick={() => setAppliedSearch(search)}>
              Apply
            </Button>
            {appliedSearch && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (rows ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No email events yet for this filter.
            </p>
          )}

          <ul className="space-y-2">
            {(rows ?? []).map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={statusVariant(r.status)}>
                    {r.status}
                  </Badge>
                  <Badge variant="outline">{r.template_name ?? "unknown"}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {r.recipient_email ?? "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                {r.error_message && (
                  <div className="mt-1 break-words rounded bg-destructive/10 p-2 text-[11px] text-destructive">
                    {r.error_message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suppressed addresses</CardTitle>
          <CardDescription>
            Addresses that bounced, complained, or unsubscribed — app emails to these addresses are
            blocked automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(suppressed ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No suppressed addresses.</p>
          ) : (
            <ul className="space-y-2">
              {(suppressed ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <Badge variant="secondary" className={statusVariant(s.reason === "bounce" ? "bounced" : s.reason === "complaint" ? "complained" : "suppressed")}>
                    {s.reason}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{s.email}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
