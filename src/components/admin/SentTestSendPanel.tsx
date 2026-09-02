import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Loader2,
  RefreshCw,
  MessageSquare,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  Globe,
  Radio,
  FileCode2,
  Terminal,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { sent } from "@/integrations/sent/client";
import { DEFAULT_SENT_TEMPLATES } from "@/integrations/sent/templates";
import { SentChannel, SentMessageRequest, SentMessageResponse, SentDiagnosticsResult, SentTemplate } from "@/integrations/sent/types";

interface MessageLogItem {
  id: string;
  recipient: string;
  channel: SentChannel;
  status: string;
  text: string;
  timestamp: string;
  cost?: { amount: number; currency: string };
  sandbox?: boolean;
}

export function SentTestSendPanel() {
  const [channel, setChannel] = useState<SentChannel>("sms");
  const [to, setTo] = useState("+12025550143");
  const [messageType, setMessageType] = useState<"text" | "template">("text");
  const [text, setText] = useState("Hello from Rentmaikar! Your Sent.dm OpenAPI v3 CPaaS integration is active and verified.");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("rentmaikar_payment_reminder");
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({
    firstName: "Alex",
    frequency: "weekly",
    amount: "$250.00",
  });
  const [sandboxMode, setSandboxMode] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [latestResponse, setLatestResponse] = useState<SentMessageResponse | null>(null);
  const [pollingStatus, setPollingStatus] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<SentDiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<MessageLogItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"compose" | "payload" | "history">("compose");

  // Selected template object
  const currentTemplate = DEFAULT_SENT_TEMPLATES.find((t) => t.id === selectedTemplateId);

  // Quick preset phone numbers
  const presets = [
    { label: "🇺🇸 US Driver (+1)", number: "+12025550143" },
    { label: "🇳🇬 Nigeria Driver (+234)", number: "+2348012345678" },
    { label: "🇬🇧 UK / Global (+44)", number: "+447700900077" },
  ];

  // Run diagnostics on mount
  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const res = await sent.runDiagnostics();
      setDiagnostics(res);
      if (res.healthy) {
        toast.success("Sent.dm OpenAPI v3 Gateway Connected", {
          description: `Latency: ${res.latency_ms}ms | Channels: ${res.supported_channels.join(", ").toUpperCase()}`,
        });
      }
    } catch (err: any) {
      toast.error("Sent.dm diagnostics error", { description: err.message });
    } finally {
      setDiagLoading(false);
    }
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Please provide a recipient phone number");
      return;
    }

    setSending(true);
    try {
      const payload: SentMessageRequest = {
        to: [to.trim()],
        channel,
        text: messageType === "text" ? text : undefined,
        template: messageType === "template" && currentTemplate ? {
          id: currentTemplate.id,
          parameters: templateParams,
        } : undefined,
        sender_id: "Rentmaikar",
        sandbox: sandboxMode,
        metadata: {
          source: "admin_test_panel",
          admin_user: "adebayoolusola39@gmail.com",
        },
      };

      const res = await sent.sendMessage(payload);
      setLatestResponse(res);

      const logItem: MessageLogItem = {
        id: res.id,
        recipient: to.trim(),
        channel,
        status: res.status,
        text: messageType === "text" ? text : `Template: ${currentTemplate?.name}`,
        timestamp: new Date().toLocaleTimeString(),
        cost: res.cost,
        sandbox: res.sandbox,
      };

      setHistory((prev) => [logItem, ...prev.slice(0, 19)]);
      toast.success(`Message dispatched via Sent.dm (${channel.toUpperCase()})`, {
        description: `Message ID: ${res.id} • Status: ${res.status.toUpperCase()}`,
      });
    } catch (err: any) {
      toast.error("Sent.dm dispatch failed", { description: err.message });
    } finally {
      setSending(false);
    }
  };

  const pollStatus = async () => {
    if (!latestResponse?.id) return;
    setPollingStatus(true);
    try {
      const updated = await sent.getMessageStatus(latestResponse.id);
      setLatestResponse(updated);
      setHistory((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item))
      );
      toast.info(`Sent.dm status: ${updated.status.toUpperCase()}`);
    } catch (e: any) {
      toast.error(`Poll failed: ${e.message}`);
    } finally {
      setPollingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "delivered":
      case "read":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="w-3 h-3" /> {status.toUpperCase()}</Badge>;
      case "sending":
      case "queued":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1"><Clock className="w-3 h-3 animate-spin" /> {status.toUpperCase()}</Badge>;
      case "failed":
      case "undelivered":
        return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1"><XCircle className="w-3 h-3" /> {status.toUpperCase()}</Badge>;
      default:
        return <Badge variant="outline">{status.toUpperCase()}</Badge>;
    }
  };

  // Construct current simulated request payload for live preview
  const livePayloadPreview = {
    url: "https://api.sent.dm/v3/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": diagnostics?.api_key_configured ? "sent_live_••••••••••••" : "sent_sandbox_test_key",
      "x-idempotency-key": `rm_${Date.now()}`,
      ...(sandboxMode ? { "x-sandbox": "true" } : {}),
    },
    body: {
      to: [to],
      channel,
      sender_id: "Rentmaikar",
      ...(messageType === "text"
        ? { text }
        : {
            template: {
              id: selectedTemplateId,
              parameters: templateParams,
            },
          }),
      metadata: {
        platform: "Rentmaikar",
        source: "admin_cpaas_gateway",
      },
    },
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Globe className="w-5 h-5" />
              </div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                Sent.dm Global CPaaS Gateway
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary font-mono">
                  OpenAPI v3
                </Badge>
              </CardTitle>
            </div>
            <CardDescription>
              Universal multi-channel communications alternative to Twilio and Termii (SMS, WhatsApp, RCS).
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runDiagnostics}
              disabled={diagLoading}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? "animate-spin" : ""}`} />
              Diagnostics
            </Button>

            <a
              href="https://docs.sent.dm/api/openapi/v3"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Diagnostics Ribbon */}
        {diagnostics && (
          <div className="mt-3 p-2.5 rounded-lg bg-muted/50 border border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Gateway Status: <strong className="text-foreground">{diagnostics.healthy ? "Operational" : "Degraded"}</strong>
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">
                Base URL: <code className="text-foreground font-mono">https://api.sent.dm</code>
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">
                Latency: <strong className="text-foreground">{diagnostics.latency_ms}ms</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-mono">
                Balance: ${diagnostics.account?.balance.toFixed(2)} USD
              </Badge>
              <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary border-primary/20">
                Tier: {diagnostics.account?.tier.toUpperCase()}
              </Badge>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex gap-2">
            <Button
              variant={activeSubTab === "compose" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab("compose")}
              className="h-8 text-xs gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Compose &amp; Test
            </Button>
            <Button
              variant={activeSubTab === "payload" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab("payload")}
              className="h-8 text-xs gap-1.5"
            >
              <FileCode2 className="w-3.5 h-3.5" /> OpenAPI v3 Inspector
            </Button>
            <Button
              variant={activeSubTab === "history" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSubTab("history")}
              className="h-8 text-xs gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" /> Dispatch History ({history.length})
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="sandbox-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Sandbox Mode
            </Label>
            <Switch
              id="sandbox-toggle"
              checked={sandboxMode}
              onCheckedChange={setSandboxMode}
            />
          </div>
        </div>

        {/* Tab 1: Compose & Test */}
        {activeSubTab === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Col: Composer Form (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Channel Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Communication Channel
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={channel === "sms" ? "default" : "outline"}
                    className="h-10 text-xs font-medium gap-2 justify-center"
                    onClick={() => setChannel("sms")}
                  >
                    <MessageSquare className="w-4 h-4" /> SMS (Global)
                  </Button>
                  <Button
                    type="button"
                    variant={channel === "whatsapp" ? "default" : "outline"}
                    className="h-10 text-xs font-medium gap-2 justify-center"
                    onClick={() => setChannel("whatsapp")}
                  >
                    <Phone className="w-4 h-4" /> WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant={channel === "rcs" ? "default" : "outline"}
                    className="h-10 text-xs font-medium gap-2 justify-center"
                    onClick={() => setChannel("rcs")}
                  >
                    <Radio className="w-4 h-4" /> RCS Business
                  </Button>
                </div>
              </div>

              {/* Destination Input & Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Destination Phone Number (E.164)
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Quick Presets:</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="+12025550143 or +2348012345678"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {presets.map((p) => (
                    <button
                      key={p.number}
                      type="button"
                      onClick={() => setTo(p.number)}
                      className="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Payload Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payload Format
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={messageType === "text" ? "secondary" : "ghost"}
                    onClick={() => setMessageType("text")}
                    className="text-xs h-7"
                  >
                    Free-form Text Body
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={messageType === "template" ? "secondary" : "ghost"}
                    onClick={() => setMessageType("template")}
                    className="text-xs h-7"
                  >
                    Sent Predefined Template
                  </Button>
                </div>
              </div>

              {/* Free-form text body */}
              {messageType === "text" && (
                <div className="space-y-1.5">
                  <Textarea
                    rows={4}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter message content..."
                    className="text-sm font-sans"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{text.length} characters</span>
                    <span>{Math.ceil(text.length / 160)} SMS Segment(s)</span>
                  </div>
                </div>
              )}

              {/* Template selector & parameters */}
              {messageType === "template" && (
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">Select Template</Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_SENT_TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">
                            {t.name} ({t.channel.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {currentTemplate && (
                    <>
                      <div className="p-2 rounded bg-background border text-xs text-muted-foreground italic">
                        "{currentTemplate.body}"
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Template Parameters</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {currentTemplate.parameters.map((param) => (
                            <div key={param} className="space-y-1">
                              <span className="text-[10px] text-muted-foreground font-mono uppercase">{param}</span>
                              <Input
                                value={templateParams[param] || ""}
                                onChange={(e) =>
                                  setTemplateParams((prev) => ({ ...prev, [param]: e.target.value }))
                                }
                                placeholder={`Value for ${param}`}
                                className="h-8 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !to.trim()}
                  className="gap-2 flex-1 font-semibold"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Dispatches to Sent.dm...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Dispatch via Sent.dm ({channel.toUpperCase()})
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Right Col: Live Delivery Status Card (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <Card className="bg-muted/40 border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" /> Delivery Status Tracker
                    </CardTitle>
                    {latestResponse && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={pollStatus}
                        disabled={pollingStatus}
                        className="h-7 text-xs gap-1 px-2"
                      >
                        <RefreshCw className={`w-3 h-3 ${pollingStatus ? "animate-spin" : ""}`} /> Refresh
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {latestResponse ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between py-1 border-b">
                        <span className="text-muted-foreground">Status:</span>
                        {getStatusBadge(latestResponse.status)}
                      </div>
                      <div className="flex items-center justify-between py-1 border-b font-mono">
                        <span className="text-muted-foreground font-sans">Message ID:</span>
                        <span className="text-foreground text-[11px]">{latestResponse.id}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b">
                        <span className="text-muted-foreground">Channel:</span>
                        <Badge variant="outline">{latestResponse.channel.toUpperCase()}</Badge>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b font-mono">
                        <span className="text-muted-foreground font-sans">Recipient:</span>
                        <span>{latestResponse.to.join(", ")}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b font-mono">
                        <span className="text-muted-foreground font-sans">Estimated Cost:</span>
                        <span>
                          {latestResponse.cost
                            ? `${latestResponse.cost.currency} ${latestResponse.cost.amount.toFixed(4)}`
                            : "$0.0120 USD"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 font-mono">
                        <span className="text-muted-foreground font-sans">Mode:</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {latestResponse.sandbox ? "SANDBOX SIMULATION" : "LIVE CARRIER"}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground space-y-2">
                      <Send className="w-8 h-8 mx-auto opacity-30" />
                      <p>No test message dispatched yet.</p>
                      <p className="text-[11px]">Send a test above to inspect live delivery response from Sent.dm.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CPaaS Value Proposition Card */}
              <div className="p-3 rounded-lg border bg-primary/5 space-y-1.5 text-xs text-muted-foreground">
                <strong className="text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Why Sent.dm?
                </strong>
                <p>
                  Single unified REST API replaces regional fragmentation between Twilio (US) and Termii (NG) with global SMS, WhatsApp, and RCS routing under a single contract.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: OpenAPI v3 Inspector */}
        {activeSubTab === "payload" && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto space-y-2">
              <div className="text-zinc-400 font-bold border-b border-zinc-800 pb-1 flex items-center justify-between">
                <span>HTTP Request (OpenAPI v3 Specification)</span>
                <span className="text-[11px] text-emerald-400">POST https://api.sent.dm/v3/messages</span>
              </div>
              <pre className="text-[12px] text-emerald-300">
                {JSON.stringify(livePayloadPreview, null, 2)}
              </pre>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1.5">
              <strong className="text-foreground">OpenAPI v3 Key Benefits:</strong>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>Strict schema validation with native idempotency key deduplication.</li>
                <li>Single payload structure across all 3 channels: SMS, WhatsApp, and RCS.</li>
                <li>Built-in sandbox simulation headers without changing production endpoints.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: Dispatch History */}
        {activeSubTab === "history" && (
          <div className="space-y-3">
            {history.length > 0 ? (
              <div className="divide-y border rounded-lg overflow-hidden">
                {history.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-muted/30">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {item.channel.toUpperCase()}
                        </Badge>
                        <strong className="text-foreground">{item.recipient}</strong>
                        <span className="text-muted-foreground">• {item.timestamp}</span>
                      </div>
                      <p className="text-muted-foreground truncate max-w-md">{item.text}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(item.status)}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.cost ? `$${item.cost.amount.toFixed(3)}` : "$0.012"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No dispatch history in current session.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
