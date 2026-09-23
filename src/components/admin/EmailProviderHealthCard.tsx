import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  RefreshCw, 
  Loader2, 
  Send, 
  ShieldCheck, 
  Activity, 
  Server,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface EmailHealthData {
  ok: boolean;
  provider: "resend" | "smtp";
  status: "ok" | "failed" | "not_configured";
  message: string;
  detail: string;
  latency_ms: number;
  domain: string;
  domainVerified: boolean;
  apiKeyConfigured: boolean;
  smtpConfigured: boolean;
  webhookConfigured: boolean;
  recentLogsCount: number;
  lastSentAt: string | null;
  lastError: string | null;
  senders?: {
    security: string;
    support: string;
    noreply: string;
  };
  checkedAt: string;
}

export function EmailProviderHealthCard() {
  const [loading, setLoading] = useState<boolean>(true);
  const [health, setHealth] = useState<EmailHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState<string>("");
  const [sendingTest, setSendingTest] = useState<boolean>(false);

  const fetchHealth = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      // First try dedicated /api/email/health endpoint, fallback to edge function gateway
      let data: EmailHealthData;
      try {
        const res = await fetch("/api/email/health", {
          headers: { Accept: "application/json" },
        });
        data = await res.json();
      } catch {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("email-health");
        if (fnErr) throw fnErr;
        data = fnData as EmailHealthData;
      }

      setHealth(data);
      if (showToast) {
        if (data.status === "ok") {
          toast.success("Email provider is healthy & connected", {
            description: `${data.provider.toUpperCase()} · ${data.domain} verified (${data.latency_ms}ms)`,
          });
        } else if (data.status === "not_configured") {
          toast.warning("Email provider not configured", {
            description: data.message,
          });
        } else {
          toast.error("Email provider health check failed", {
            description: data.detail || data.message,
          });
        }
      }
    } catch (e: any) {
      console.error("Email health fetch failed:", e);
      setError(e.message || "Failed to contact email health check service");
      if (showToast) {
        toast.error("Health check request failed", { description: e.message });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth(false);
  }, []);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Please enter a valid recipient email address");
      return;
    }

    setSendingTest(true);
    try {
      https://staging.rentmaikar.com/api/functions/send-outbound-email
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "send",
    to: testEmail.trim(),
    subject: "RentMaikar Email Provider Diagnostic Test",
    templateName: "diagnostic-test",
    body: `This is a live diagnostic verification email sent from the RentMaikar Credential Health dashboard.

Provider: ${health?.provider?.toUpperCase() || "RESEND"}
Domain: ${health?.domain || "notify.rentmaikar.com"}
Timestamp: ${new Date().toISOString()}

If you received this message, outbound transactional email delivery is functioning normally.`,
    content: `This is a live diagnostic verification email sent from the RentMaikar Credential Health dashboard.

Provider: ${health?.provider?.toUpperCase() || "RESEND"}
Domain: ${health?.domain || "notify.rentmaikar.com"}
Timestamp: ${new Date().toISOString()}

If you received this message, outbound transactional email delivery is functioning normally.`,
    category: "diagnostic",
  }),
});

const result = await res.json().catch(() => null);

if (
  !res.ok ||
  result?.ok === false ||
  result?.success === false
) {
  throw new Error(
    result?.error ||
      result?.message ||
      `Email delivery failed with HTTP ${res.status}`
  );
}

toast.success(`Diagnostic email dispatched to ${testEmail}!`, {
  description: `Message ID: ${
    result?.messageId || result?.id || "Queued"
  } · Checked via ${health?.domain || "notify.rentmaikar.com"}`,
});
      // Refresh audit logs
      fetchHealth(false);
    } catch (err: any) {
      toast.error("Failed to send diagnostic email", {
        description: err.message || "Provider error during dispatch",
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Email Delivery Provider (Resend / SMTP)</CardTitle>
            {health && (
              <Badge
                variant={
                  health.status === "ok"
                    ? "default"
                    : health.status === "not_configured"
                    ? "outline"
                    : "destructive"
                }
                className={health.status === "ok" ? "bg-emerald-600 hover:bg-emerald-600 text-white gap-1 text-xs" : "gap-1 text-xs"}
              >
                {health.status === "ok" && <CheckCircle2 className="h-3 w-3" />}
                {health.status === "not_configured" && <HelpCircle className="h-3 w-3" />}
                {health.status === "failed" && <AlertCircle className="h-3 w-3" />}
                {health.status === "ok"
                  ? "Connected & Verified"
                  : health.status === "not_configured"
                  ? "Not Configured"
                  : "Connection Issue"}
              </Badge>
            )}
          </div>
          <CardDescription>
            Live connection diagnostic testing domain verification, API authentication, and delivery audit logs.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchHealth(true)}
          disabled={loading}
          className="gap-2 shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-check Connection
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 text-xs font-mono bg-destructive/10 text-destructive border border-destructive/30 rounded-md">
            {error}
          </div>
        )}

        {loading && !health ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Testing email provider endpoint and verified domain...</span>
          </div>
        ) : health ? (
          <div className="space-y-4">
            {/* Health metrics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" /> Provider
                </span>
                <p className="text-sm font-semibold capitalize">{health.provider}</p>
                <span className="text-[11px] text-muted-foreground">
                  {health.apiKeyConfigured ? "API Key active" : health.smtpConfigured ? "SMTP host ready" : "Unset"}
                </span>
              </div>

              <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Sending Domain
                </span>
                <p className="text-sm font-semibold truncate" title={health.domain}>
                  {health.domain}
                </p>
                <span className="text-[11px] text-emerald-600 font-medium">
                  {health.domainVerified ? "DNS / DKIM Verified" : "Verification in progress"}
                </span>
              </div>

              <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> API Latency
                </span>
                <p className="text-sm font-semibold">{health.latency_ms} ms</p>
                <span className="text-[11px] text-muted-foreground">
                  Webhook secret: {health.webhookConfigured ? "Configured" : "Optional"}
                </span>
              </div>

              <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Audit Log Status
                </span>
                <p className="text-sm font-semibold">{health.recentLogsCount} Recent Logs</p>
                <span className="text-[11px] text-muted-foreground truncate block" title={health.lastSentAt || "None"}>
                  {health.lastSentAt ? `Last: ${new Date(health.lastSentAt).toLocaleTimeString()}` : "No outbound logs"}
                </span>
              </div>
            </div>

            {/* Provider detail feedback box */}
            <div className="rounded-md border p-3 bg-card text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Diagnostic Message:</span>
                <span className="text-[11px] text-muted-foreground">
                  Tested {new Date(health.checkedAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed">{health.message} {health.detail}</p>
              {health.lastError && (
                <p className="text-destructive font-mono text-[11px]">
                  Recent Delivery Warning: {health.lastError}
                </p>
              )}
            </div>

            {/* Configured Sender Addresses & DNS Guidance */}
            <div className="text-xs rounded-md bg-muted/40 p-3 border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground block">Active Sender Addresses ({health.domain}):</span>
                <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Resend DKIM: resend._domainkey.{health.domain.includes("notify") ? "rentmaikar.com" : health.domain}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
                <div className="truncate">
                  <strong className="text-foreground">Security: </strong>
                  <code>security@{health.domain}</code>
                </div>
                <div className="truncate">
                  <strong className="text-foreground">Support: </strong>
                  <code>support@{health.domain}</code>
                </div>
                <div className="truncate">
                  <strong className="text-foreground">Notifications: </strong>
                  <code>noreply@{health.domain}</code>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                <span>
                  <strong>Sender Authentication Note:</strong> For maximum inbox placement at Gmail and Yahoo, senders must pass SPF & DKIM. Domain <code className="text-foreground font-mono">rentmaikar.com</code> has active DKIM key in DNS. If sending from <code className="text-foreground font-mono">notify.rentmaikar.com</code>, add TXT record <code className="text-foreground font-mono">resend._domainkey.notify.rentmaikar.com</code> in DNS.
                </span>
              </div>
            </div>

            {/* One-click end-to-end test dispatch */}
            <div className="pt-2 border-t space-y-2">
              <form onSubmit={handleSendTestEmail} className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 w-full">
                  <Input
                    type="email"
                    placeholder="Enter recipient email (e.g. you@gmail.com or delivered@resend.dev)"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTestEmail("delivered@resend.dev")}
                    className="h-9 text-xs whitespace-nowrap"
                  >
                    Test Sink
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={sendingTest || !testEmail}
                    className="gap-2 shrink-0 flex-1 sm:flex-none h-9 text-xs whitespace-nowrap"
                  >
                    {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Live Test Email
                  </Button>
                </div>
              </form>
              <p className="text-[11px] text-muted-foreground">
                Tip: Resend requires a verified destination or official test sink (<code className="text-foreground">delivered@resend.dev</code>). Standard RFC documentation domains (<code className="text-foreground">@example.com</code>) are disallowed by Resend.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
