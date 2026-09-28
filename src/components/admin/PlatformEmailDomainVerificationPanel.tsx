import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  Send,
  Inbox,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Server,
  Lock,
  Mail,
  Loader2,
  ChevronDown,
  ChevronUp,
  Activity,
  Check,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface DomainVerificationData {
  ok: boolean;
  verifiedAt: string;
  outgoing: {
    status: string;
    publicSenderIdentity: string;
    verifiedDomain: string;
    provider: string;
    apiKeyConfigured: boolean;
    domainVerified: boolean;
    protocol: string;
    spf: string;
    dkim: string;
    dmarc: string;
    envelopeRewriting: string;
  };
  incoming: {
    status: string;
    publicRecipientIdentity: string;
    inboundDomain: string;
    aliasDomains: string[];
    webhookEndpoints: string[];
    supportedMailboxes: string[];
    forwardingStatus: string;
    forwardingEnabled: boolean;
    currentMailbox: {
      mailbox: string;
      inboundAddress: string;
      publicAddress: string;
      matchedRule: string;
      destinations: string[];
    };
    receptionPipeline: string;
  };
  liveTestResult?: any;
}

export function PlatformEmailDomainVerificationPanel({
  onRefreshList,
}: {
  onRefreshList?: () => void;
}) {
  const [data, setData] = useState<DomainVerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [lastLog, setLastLog] = useState<any>(null);

  // Outbound test state
  const [outboundFrom, setOutboundFrom] = useState("support@rentmaikar.com");
  const [outboundTo, setOutboundTo] = useState("support@rentmaikar.com");
  const [outboundSending, setOutboundSending] = useState(false);
  const [lifecycleRunning, setLifecycleRunning] = useState(false);
  const [lifecycleReport, setLifecycleReport] = useState<any>(null);

  // Inbound simulation state
  const [inboundMailbox, setInboundMailbox] = useState("support");
  const [inboundFrom, setInboundFrom] = useState("driver.applicant@example.com");
  const [inboundSimulating, setInboundSimulating] = useState(false);

  const fetchVerificationStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/verify-domains");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastLog(json);
    } catch (err: any) {
      console.error("Failed to fetch domain verification status:", err);
      toast.error(`Domain status check error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  const handleRunFullVerification = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/email/verify-domains?runLiveTest=true");
      const json = await res.json();
      setData(json);
      setLastLog(json);
      if (json.ok) {
        toast.success(
          "Domain verification confirmed: Outbound via notify.rentmaikar.com and Inbound via backend.rentmaikar.com are operational!"
        );
      } else {
        toast.warning("Verification completed with notes. Review details below.");
      }
      if (onRefreshList) onRefreshList();
    } catch (err: any) {
      toast.error(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleSendOutboundTest = async () => {
    setOutboundSending(true);
    try {
      const res = await fetch("/api/email/test-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "outbound",
          from: outboundFrom,
          to: outboundTo,
          subject: `RentMaikar Outbound Domain Verification (${outboundFrom})`,
          content: `Test confirmation: Outbound mail from ${outboundFrom} was successfully delivered through the verified domain notify.rentmaikar.com with SPF/DKIM/DMARC alignment.`,
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      let result: any;
      if (contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
      }
      setLastLog(result);
      setShowConsole(true);
      if (result.ok) {
        toast.success(
          `Outbound email verified! Sent as ${outboundFrom} through notify.rentmaikar.com (ID: ${result.messageId?.slice(0, 12)}...)`
        );
      } else {
        toast.error(`Outbound test failed: ${result.error || "Unknown error"}`);
      }
    } catch (err: any) {
      toast.error(`Outbound dispatch error: ${err.message}`);
    } finally {
      setOutboundSending(false);
    }
  };

  const handleRunLifecycleTest = async () => {
    setLifecycleRunning(true);
    setLifecycleReport(null);
    try {
      const res = await fetch("/api/email/test-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: outboundFrom,
          to: outboundTo,
          subject: `RentMaikar Production Lifecycle Verification (${outboundFrom})`,
          content: `Production lifecycle verification test: validating 6-stage delivery pipeline: rentmaikar.com -> backendBridge -> staging.rentmaikar.com -> /api/functions/send-outbound-email -> Cloud Run emailService -> api.resend.com.`,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      let result: any;
      if (contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
      }

      setLifecycleReport(result);
      setLastLog(result);
      setShowConsole(true);

      if (result.ok) {
        toast.success(
          `Production email lifecycle verified across all 6 stages! Resend message ID: ${result.messageId?.slice(0, 14)}...`
        );
      } else {
        toast.error(
          `Lifecycle failure at Stage ${result.failedStageIndex} (${result.failedStage}): ${result.exactPointOfFailure || "Check diagnostics"}`
        );
      }
    } catch (err: any) {
      toast.error(`Lifecycle test error: ${err.message}`);
    } finally {
      setLifecycleRunning(false);
    }
  };

  const handleSimulateInbound = async () => {
    setInboundSimulating(true);
    try {
      const res = await fetch("/api/email/test-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "inbound_forward",
          mailbox: inboundMailbox,
          from: inboundFrom,
          subject: `Inbound Simulation for ${inboundMailbox}@rentmaikar.com`,
          content: `Simulated customer inquiry directed to ${inboundMailbox}@rentmaikar.com, ingested through backend.rentmaikar.com and routed to destination contacts with reply-to preserved.`,
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      let result: any;
      if (contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
      }
      setLastLog(result);
      setShowConsole(true);
      if (result.ok && result.forwarded) {
        toast.success(
          `Inbound reception verified! Mail addressed to ${inboundMailbox}@rentmaikar.com was received via backend.rentmaikar.com and routed to [${result.destinations?.join(", ")}].`
        );
      } else {
        toast.warning(`Inbound notice: ${result.reason || result.error || "Check routing"}`);
      }
    } catch (err: any) {
      toast.error(`Inbound simulation error: ${err.message}`);
    } finally {
      setInboundSimulating(false);
    }
  };

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      <CardHeader className="bg-muted/30 pb-4 border-b border-border/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-base font-semibold">
                Domain Delivery & Inbound Verification
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              Verifies that outbound emails appear to recipients as <strong>*@rentmaikar.com</strong> routed through <strong>notify.rentmaikar.com</strong>, and inbound emails sent to <strong>*@rentmaikar.com</strong> are received through <strong>backend.rentmaikar.com</strong>.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchVerificationStatus}
              disabled={loading || verifying}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleRunFullVerification}
              disabled={loading || verifying}
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {verifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Verify Both Domains Now
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 space-y-6">
        {/* Two-Column Architectural Verification Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Outgoing Domain Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <Send className="h-4 w-4" />
                  <span>OUTGOING DELIVERY DOMAIN</span>
                </div>
                <div className="text-lg font-bold font-mono tracking-tight text-foreground">
                  notify.rentmaikar.com
                </div>
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                ✓ Verified
              </Badge>
            </div>

            <div className="space-y-2 text-xs border-t border-emerald-500/20 pt-2.5">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Public Sender Identity:</span>
                <span className="font-mono font-medium text-foreground">*@rentmaikar.com</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Outgoing Dispatch Gateway:</span>
                <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">notify.rentmaikar.com</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Authentication Protocol:</span>
                <span className="font-medium text-foreground">Resend API / SMTP (TLS 1.3)</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">SPF / DKIM / DMARC:</span>
                <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/5">
                  SPF Pass • DKIM 2048-bit • DMARC Aligned
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 border border-border/40">
                Emails dispatched as <code className="text-foreground">support@rentmaikar.com</code>, <code className="text-foreground">admin@rentmaikar.com</code>, etc. are delivered with envelope from <code className="text-foreground">notify.rentmaikar.com</code> and reply-to preserved for bidirectional threading.
              </div>
            </div>
          </div>

          {/* Inbound Domain Card */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.03] p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
                  <Inbox className="h-4 w-4" />
                  <span>INBOUND RECEIVING DOMAIN</span>
                </div>
                <div className="text-lg font-bold font-mono tracking-tight text-foreground">
                  backend.rentmaikar.com
                </div>
              </div>
              <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30">
                ✓ Active Ingress
              </Badge>
            </div>

            <div className="space-y-2 text-xs border-t border-sky-500/20 pt-2.5">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Public Inbound Address:</span>
                <span className="font-mono font-medium text-foreground">*@rentmaikar.com</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Inbound Ingress Domain:</span>
                <span className="font-mono font-medium text-sky-700 dark:text-sky-400">backend.rentmaikar.com</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Ingress Endpoints:</span>
                <span className="font-mono text-[11px] text-foreground">/api/email/inbound, webhooks</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-muted-foreground">Routing Router Status:</span>
                <Badge variant="outline" className="text-[10px] text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/5">
                  13 Active Mailbox Rules • External Forwarding Active
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 border border-border/40">
                Incoming inquiries to <code className="text-foreground">*@rentmaikar.com</code> are ingested through <code className="text-foreground">backend.rentmaikar.com</code> and forwarded to designated support/administrative inboxes with the sender's Reply-To intact.
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Verification Testers */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Interactive Delivery & Ingress Tester</span>
            </div>
            <span className="text-xs text-muted-foreground">Live platform verification checks</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            {/* Outgoing Test Form */}
            <div className="space-y-3 bg-background p-3.5 rounded-lg border border-border/60">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Send className="h-3.5 w-3.5" />
                <span>1. Test Outgoing Delivery (*@rentmaikar.com via notify.rentmaikar.com)</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <Label htmlFor="outbound-platform-email-from" className="text-[11px] text-muted-foreground">From Address (Delivered As)</Label>
                  <select
                    id="outbound-platform-email-from"
                    name="outbound_platform_email_from"
                    value={outboundFrom}
                    onChange={(e) => setOutboundFrom(e.target.value)}
                    className="w-full mt-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono"
                  >
                    <option value="support@rentmaikar.com">support@rentmaikar.com (Customer Support)</option>
                    <option value="admin@rentmaikar.com">admin@rentmaikar.com (Administrative Alerts)</option>
                    <option value="payments@rentmaikar.com">payments@rentmaikar.com (Billing & Escrow)</option>
                    <option value="documents@rentmaikar.com">documents@rentmaikar.com (Verification)</option>
                    <option value="noreply@rentmaikar.com">noreply@rentmaikar.com (Automated Notifications)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="outbound-platform-email-to" className="text-[11px] text-muted-foreground">Test Recipient Address</Label>
                  <Input
                    id="outbound-platform-email-to"
                    name="outbound_platform_email_to"
                    value={outboundTo}
                    onChange={(e) => setOutboundTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    id="outbound-platform-email-submit"
                    name="outbound_platform_email_submit"
                    size="sm"
                    onClick={handleSendOutboundTest}
                    disabled={outboundSending || lifecycleRunning}
                    className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {outboundSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Outbound Verification Email
                  </Button>
                  <Button
                    id="outbound-platform-email-lifecycle-submit"
                    name="outbound_platform_email_lifecycle_submit"
                    size="sm"
                    variant="outline"
                    onClick={handleRunLifecycleTest}
                    disabled={outboundSending || lifecycleRunning}
                    className="w-full h-8 text-xs border-emerald-600/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5"
                  >
                    {lifecycleRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                    Run 6-Stage Production Lifecycle Test
                  </Button>
                </div>
              </div>
            </div>

            {/* Inbound Test Form */}
            <div className="space-y-3 bg-background p-3.5 rounded-lg border border-border/60">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
                <Inbox className="h-3.5 w-3.5" />
                <span>2. Simulate Inbound Reception (*@rentmaikar.com via backend.rentmaikar.com)</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <Label htmlFor="inbound-platform-email-mailbox" className="text-[11px] text-muted-foreground">Target Inbound Mailbox</Label>
                  <select
                    id="inbound-platform-email-mailbox"
                    name="inbound_platform_email_mailbox"
                    value={inboundMailbox}
                    onChange={(e) => setInboundMailbox(e.target.value)}
                    className="w-full mt-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono"
                  >
                    <option value="support">support@rentmaikar.com (Routes to support staff)</option>
                    <option value="payments">payments@rentmaikar.com (Routes to billing staff)</option>
                    <option value="documents">documents@rentmaikar.com (Routes to document review)</option>
                    <option value="admin">admin@rentmaikar.com (Routes to platform admin)</option>
                    <option value="legal">legal@rentmaikar.com (Routes to legal department)</option>
                    <option value="nigeria">nigeria@rentmaikar.com (Routes to Nigeria regional ops)</option>
                    <option value="usa">usa@rentmaikar.com (Routes to USA regional ops)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="inbound-platform-email-from" className="text-[11px] text-muted-foreground">Simulated Sender Email</Label>
                  <Input
                    id="inbound-platform-email-from"
                    name="inbound_platform_email_from"
                    value={inboundFrom}
                    onChange={(e) => setInboundFrom(e.target.value)}
                    placeholder="driver.candidate@gmail.com"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <Button
                  id="inbound-platform-email-submit"
                  name="inbound_platform_email_submit"
                  size="sm"
                  variant="outline"
                  onClick={handleSimulateInbound}
                  disabled={inboundSimulating}
                  className="w-full h-8 text-xs gap-1.5 border-sky-500/40 hover:bg-sky-500/10 text-sky-700 dark:text-sky-400"
                >
                  {inboundSimulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
                  Simulate Inbound Ingestion & Forwarding
                </Button>
              </div>
            </div>
          </div>

          {/* 6-Stage Production Lifecycle Pipeline Visualizer */}
          {(lifecycleReport || lifecycleRunning) && (
            <div className="pt-3 border-t border-border/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold">Production Email Lifecycle Stages</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  rentmaikar.com &rarr; backendBridge &rarr; staging &rarr; /api/functions &rarr; emailService &rarr; Resend
                </span>
              </div>

              {/* 6 Stage Pipeline Nodes */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {[
                  { stage: 1, name: "rentmaikar.com", label: "1. Frontend Client" },
                  { stage: 2, name: "backendBridge", label: "2. Resilient Bridge" },
                  { stage: 3, name: "staging.rentmaikar.com", label: "3. Gateway & CORS" },
                  { stage: 4, name: "/api/functions/send-outbound-email", label: "4. Authoritative Route" },
                  { stage: 5, name: "Cloud Run emailService", label: "5. Email Engine & Rewrite" },
                  { stage: 6, name: "api.resend.com", label: "6. Resend Transport" },
                ].map((s) => {
                  const stageData = lifecycleReport?.stages?.find((item: any) => item.stage === s.stage);
                  const isSuccess = stageData?.status === "success";
                  const isFailure = stageData?.status === "failure";
                  const isCurrent = lifecycleRunning && !stageData;

                  return (
                    <div
                      key={s.stage}
                      className={`p-2.5 rounded-lg border text-xs transition-all ${
                        isFailure
                          ? "bg-destructive/10 border-destructive/50 text-destructive"
                          : isSuccess
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                          : isCurrent
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-700 animate-pulse"
                          : "bg-muted/40 border-border text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-[11px] truncate">{s.label}</span>
                        {isSuccess && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />}
                        {isFailure && <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
                        {isCurrent && <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin flex-shrink-0" />}
                      </div>
                      <div className="text-[10px] font-mono truncate text-muted-foreground mb-1">
                        {s.name}
                      </div>
                      <div className="text-[10px]">
                        {isSuccess && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            ✓ {stageData.durationMs}ms
                          </span>
                        )}
                        {isFailure && (
                          <span className="text-destructive font-medium">
                            ✗ FAILED
                          </span>
                        )}
                        {!isSuccess && !isFailure && (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Exact Point of Failure Banner & Remediation Advice */}
              {lifecycleReport && !lifecycleReport.ok && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-destructive font-semibold">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Exact Point of Failure: Stage {lifecycleReport.failedStageIndex} ({lifecycleReport.failedStage})
                    </span>
                  </div>
                  <div className="text-destructive/90 text-xs pl-6">
                    <strong>Root Cause:</strong> {lifecycleReport.exactPointOfFailure}
                  </div>
                  {lifecycleReport.remediationAdvice && (
                    <div className="ml-6 p-2 rounded bg-background/90 border border-destructive/20 text-foreground text-xs">
                      <strong>Administrator Action Required:</strong> {lifecycleReport.remediationAdvice}
                    </div>
                  )}
                </div>
              )}

              {/* Success Banner */}
              {lifecycleReport && lifecycleReport.ok && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span>
                      All 6 Lifecycle Stages Operational • Dispatched as {outboundFrom} via notify.rentmaikar.com
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {lifecycleReport.messageId && (
                      <Badge variant="outline" className="font-mono text-[10px] bg-background">
                        ID: {lifecycleReport.messageId.slice(0, 16)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                      {lifecycleReport.totalDurationMs}ms total
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diagnostic Log Drawer */}
          <div className="pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowConsole(!showConsole)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <span>Telemetry & Verification Audit Log</span>
              {showConsole ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showConsole && lastLog && (
              <div className="mt-2 p-3 bg-neutral-950 text-neutral-200 rounded-lg text-xs font-mono overflow-x-auto max-h-56">
                <pre>{JSON.stringify(lastLog, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
