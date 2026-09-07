import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  MailCheck,
  MailX,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
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
  payload_excerpt?: string | null;
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
  const [errorCategory, setErrorCategory] = useState<"all" | "auth" | "dlq" | "send">("all");
  const [errorSearch, setErrorSearch] = useState("");
  const [expandedErrorIds, setExpandedErrorIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedErrorIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const { data: recentErrors } = useQuery({
    queryKey: ["email-recent-errors"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
        .or("status.in.(failed,bounced,complaint),error_message.not.is.null")
        .order("created_at", { ascending: false })
        .limit(50);
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
        .select("id, function_name, status, recipient_email, subject, provider_response, payload_excerpt, created_at")
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

  const pausedDlqCount = useMemo(() => {
    return (dlqRetries ?? []).filter((d) => d.paused).length;
  }, [dlqRetries]);

  type UnifiedErrorItem = {
    id: string;
    rawId: string;
    type: "auth" | "dlq" | "send";
    badgeText: string;
    badgeVariant: "destructive" | "warning";
    recipientEmail: string;
    functionOrTemplate: string;
    timestamp: string;
    subject?: string | null;
    errorMessage: string;
    providerResponse?: string | null;
    payloadExcerpt?: string | null;
    attempts?: number;
    paused?: boolean;
  };

  const unifiedErrors: UnifiedErrorItem[] = useMemo(() => {
    const list: UnifiedErrorItem[] = [];

    // 1. Provider Auth Failures (401/403)
    (providerAlerts ?? []).forEach((a) => {
      list.push({
        id: `alert-${a.id}`,
        rawId: a.id,
        type: "auth",
        badgeText: `Resend ${a.status} ${a.status === 401 ? "Unauthorized" : "Forbidden"}`,
        badgeVariant: "destructive",
        recipientEmail: a.recipient_email ?? "Unknown recipient",
        functionOrTemplate: a.function_name,
        timestamp: a.created_at,
        subject: a.subject,
        errorMessage: `Resend API authentication failure (HTTP ${a.status}). Verification required for RESEND_API_KEY or notify.rentmaikar.com sending domain.`,
        providerResponse: a.provider_response,
        payloadExcerpt: a.payload_excerpt,
      });
    });

    // 2. DLQ Retries (Paused or with last_error)
    (dlqRetries ?? []).forEach((d) => {
      if (d.paused || d.last_error) {
        list.push({
          id: `dlq-${d.id}`,
          rawId: d.id,
          type: "dlq",
          badgeText: d.paused ? "DLQ Paused (5/5 retries exhausted)" : `DLQ Retrying (Attempt ${d.attempts}/5)`,
          badgeVariant: d.paused ? "destructive" : "warning",
          recipientEmail: d.recipient_email ?? "Unknown recipient",
          functionOrTemplate: d.template_name ?? d.queue_name,
          timestamp: d.next_attempt_at,
          errorMessage: d.last_error ?? "Message moved to dead-letter queue after repeated delivery attempts.",
          attempts: d.attempts,
          paused: d.paused,
        });
      }
    });

    // 3. Send log errors (failed / bounced)
    (recentErrors ?? []).forEach((e) => {
      list.push({
        id: `send-${e.id}`,
        rawId: e.id,
        type: "send",
        badgeText: e.status.toUpperCase(),
        badgeVariant: "destructive",
        recipientEmail: e.recipient_email ?? "Unknown recipient",
        functionOrTemplate: e.template_name ?? "transactional",
        timestamp: e.created_at,
        errorMessage: e.error_message ?? `Email ${e.status} during dispatch.`,
      });
    });

    // Sort by timestamp descending
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [providerAlerts, dlqRetries, recentErrors]);

  const authErrorsCount = useMemo(() => unifiedErrors.filter((e) => e.type === "auth").length, [unifiedErrors]);
  const dlqErrorsCount = useMemo(() => unifiedErrors.filter((e) => e.type === "dlq").length, [unifiedErrors]);
  const sendErrorsCount = useMemo(() => unifiedErrors.filter((e) => e.type === "send").length, [unifiedErrors]);

  const filteredErrors = useMemo(() => {
    return unifiedErrors.filter((err) => {
      if (errorCategory !== "all" && err.type !== errorCategory) return false;
      if (errorSearch.trim()) {
        const q = errorSearch.trim().toLowerCase();
        const matchEmail = err.recipientEmail.toLowerCase().includes(q);
        const matchTemplate = err.functionOrTemplate.toLowerCase().includes(q);
        const matchMsg = err.errorMessage.toLowerCase().includes(q);
        const matchResp = (err.providerResponse ?? "").toLowerCase().includes(q);
        if (!matchEmail && !matchTemplate && !matchMsg && !matchResp) return false;
      }
      return true;
    });
  }, [unifiedErrors, errorCategory, errorSearch]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Seo
        title="Email Delivery Monitor | Rentmaikar Admin"
        description="Real-time delivery status, bounces, complaints, and unsubscribes for app emails."
        path="/admin/email-delivery"
        noindex
      />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Email Delivery Monitor</h1>
            <p className="text-sm text-muted-foreground">
              Real-time delivery observability across active queues, sent volumes, failure rates, and dead-letter pipelines.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono bg-muted/40">
              <span className="text-muted-foreground mr-1">Outbound Gateway:</span> notify.rentmaikar.com
            </Badge>
            <Badge variant="outline" className="font-mono bg-muted/40">
              <span className="text-muted-foreground mr-1">Inbound:</span> backend.rentmaikar.com
            </Badge>
          </div>
        </div>
      </header>

      {/* 4 Primary Requested Metrics: Queued, Sent, Failed, and DLQ */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* 1. Queued */}
        <Card className="border-sky-500/20 bg-sky-500/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium text-sky-700 dark:text-sky-300">
              <span className="flex items-center gap-1.5">
                <Inbox className="h-4 w-4" /> Queued
              </span>
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                Live
              </span>
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight">{stats.queued}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats.pending} pending in last 24h
          </CardContent>
        </Card>

        {/* 2. Sent */}
        <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <MailCheck className="h-4 w-4" /> Sent
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                24h
              </span>
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight">{stats.sent}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Delivered to recipients successfully
          </CardContent>
        </Card>

        {/* 3. Failed */}
        <Card className="border-rose-500/20 bg-rose-500/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium text-destructive">
              <span className="flex items-center gap-1.5">
                <MailX className="h-4 w-4" /> Failed
              </span>
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                24h
              </span>
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight">{stats.failed}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Bounces & delivery errors
          </CardContent>
        </Card>

        {/* 4. DLQ */}
        <Card className="border-amber-500/20 bg-amber-500/[0.03]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-300">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> DLQ
              </span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Depth: {stats.dlqQueued}
              </span>
            </CardDescription>
            <CardTitle className="text-3xl font-bold tracking-tight">{stats.dlqQueued}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats.dlq} events (24h) · {pausedDlqCount} paused
          </CardContent>
        </Card>
      </div>

      {/* Secondary Operational Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-muted-foreground">Reprocessor Worker:</span>
            <span className="font-medium">Active (Exponential Backoff)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Suppressed Emails:</span>
            <Badge variant="outline" className="text-xs font-mono">{stats.suppressed}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Provider Alerts:</span>
            <Badge variant={providerAlerts && providerAlerts.length > 0 ? "destructive" : "secondary"} className="text-xs font-mono">
              {(providerAlerts ?? []).length}
            </Badge>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={runDlqRetry} disabled={retrying}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          Run DLQ Retry Worker
        </Button>
      </div>

      {/* Recent Error Details Section */}
      <Card className="border-border">
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Recent Error Details
                </CardTitle>
                <Badge variant="secondary" className="font-mono text-xs">
                  {unifiedErrors.length} total
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Unified audit of Resend 401/403 authorization rejections, DLQ retries exceeding limits, and send-log delivery failures.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["email-recent-errors"] })}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={errorCategory === "all" ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setErrorCategory("all")}
              >
                All Errors ({unifiedErrors.length})
              </Button>
              <Button
                size="sm"
                variant={errorCategory === "auth" ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setErrorCategory("auth")}
              >
                Resend 401/403 ({authErrorsCount})
              </Button>
              <Button
                size="sm"
                variant={errorCategory === "dlq" ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setErrorCategory("dlq")}
              >
                DLQ Exhausted ({dlqErrorsCount})
              </Button>
              <Button
                size="sm"
                variant={errorCategory === "send" ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setErrorCategory("send")}
              >
                Delivery Failures ({sendErrorsCount})
              </Button>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search errors or email..."
                value={errorSearch}
                onChange={(e) => setErrorSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredErrors.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium text-foreground">No matching error records</p>
              <p className="text-xs">All recent emails and workers have executed without reported failures in this category.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredErrors.map((err) => {
                const isExpanded = expandedErrorIds[err.id] ?? false;
                return (
                  <li
                    key={err.id}
                    className="rounded-lg border bg-card p-3 text-sm transition-colors hover:border-muted-foreground/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={err.badgeVariant === "destructive" ? "destructive" : "secondary"}
                          className={
                            err.badgeVariant === "destructive"
                              ? "bg-destructive/15 text-destructive border-transparent"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent"
                          }
                        >
                          {err.badgeText}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs">
                          {err.functionOrTemplate}
                        </Badge>
                        <span className="font-medium text-foreground">{err.recipientEmail}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(err.recipientEmail, "email")}
                          title="Copy email address"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(err.timestamp).toLocaleString()}
                        </span>
                        {err.type === "auth" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => acknowledgeAlert(err.rawId)}
                          >
                            Acknowledge
                          </Button>
                        )}
                        {err.type === "dlq" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={runDlqRetry}
                            disabled={retrying}
                          >
                            Retry DLQ
                          </Button>
                        )}
                      </div>
                    </div>

                    {err.subject && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Subject:</span> {err.subject}
                      </p>
                    )}

                    <div className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive border border-destructive/20 font-mono">
                      {err.errorMessage}
                    </div>

                    {/* Expandable Diagnostic Drawer */}
                    {(err.providerResponse || err.payloadExcerpt) && (
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleExpand(err.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="mr-1 h-3.5 w-3.5" />
                          )}
                          {isExpanded ? "Hide Diagnostic Payload" : "View Diagnostic Payload & Response"}
                        </Button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2 rounded bg-muted/40 p-3 text-xs">
                            {err.providerResponse && (
                              <div>
                                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                  <span>Provider Raw Response:</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 px-1.5 text-[10px]"
                                    onClick={() => copyToClipboard(err.providerResponse!, "response")}
                                  >
                                    Copy
                                  </Button>
                                </div>
                                <pre className="max-h-32 overflow-auto rounded bg-background/80 p-2 font-mono text-[11px]">
                                  {err.providerResponse}
                                </pre>
                              </div>
                            )}

                            {err.payloadExcerpt && (
                              <div>
                                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                  <span>Payload Excerpt:</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 px-1.5 text-[10px]"
                                    onClick={() => copyToClipboard(err.payloadExcerpt!, "payload")}
                                  >
                                    Copy
                                  </Button>
                                </div>
                                <pre className="max-h-32 overflow-auto rounded bg-background/80 p-2 font-mono text-[11px]">
                                  {err.payloadExcerpt}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
