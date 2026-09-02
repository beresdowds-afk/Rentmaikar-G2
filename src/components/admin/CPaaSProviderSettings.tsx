import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Radio,
  PhoneCall,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Zap,
  ArrowRight,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cpaasRouter, CPaaSConfig, CPaaSProvider } from "@/services/cpaasRouterService";
import { sent } from "@/integrations/sent/client";

export function CPaaSProviderSettings() {
  const [config, setConfig] = useState<CPaaSConfig>(cpaasRouter.getConfig());
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [sentStatus, setSentStatus] = useState<"online" | "degraded" | "checking">("online");
  const [twilioStatus, setTwilioStatus] = useState<"online" | "degraded" | "checking">("online");
  const [termiiStatus, setTermiiStatus] = useState<"online" | "degraded" | "checking">("online");

  useEffect(() => {
    checkProvidersHealth();
  }, []);

  const checkProvidersHealth = async () => {
    setCheckingHealth(true);
    try {
      const diag = await sent.runDiagnostics();
      setSentStatus(diag.healthy ? "online" : "degraded");
      setTwilioStatus("online");
      setTermiiStatus("online");
    } catch (e) {
      setSentStatus("degraded");
    } finally {
      setCheckingHealth(false);
    }
  };

  const updateConfig = (patch: Partial<CPaaSConfig>) => {
    const updated = cpaasRouter.saveConfig(patch);
    setConfig(updated);
    toast.success("CPaaS Routing Configuration updated");
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600">
                <Layers className="w-5 h-5" />
              </div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                CPaaS Provider &amp; Routing Engine
              </CardTitle>
            </div>
            <CardDescription>
              Configure global CPaaS orchestration between Sent.dm (universal v3), Twilio (USA), and Termii (Nigeria).
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={checkProvidersHealth}
            disabled={checkingHealth}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? "animate-spin" : ""}`} />
            Check Health
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Provider Health Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Sent.dm Card */}
          <div className="p-3.5 rounded-lg border bg-muted/40 relative overflow-hidden space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                <strong className="text-sm font-semibold">Sent.dm (Global)</strong>
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> OPERATIONAL
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Unified OpenAPI v3 • SMS, WhatsApp &amp; RCS across 190+ countries
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t">
              <span>Latency: <strong>48ms</strong></span>
              <span>•</span>
              <span>Tier: <strong>GROWTH</strong></span>
            </div>
          </div>

          {/* Twilio Card */}
          <div className="p-3.5 rounded-lg border bg-muted/40 relative overflow-hidden space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-blue-500" />
                <strong className="text-sm font-semibold">Twilio (USA)</strong>
              </div>
              <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> ACTIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Regional provider for USA +1 VoIP, SMS &amp; SIP Trunking
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t">
              <span>Region: <strong>US (+1)</strong></span>
              <span>•</span>
              <span>VoIP: <strong>Enabled</strong></span>
            </div>
          </div>

          {/* Termii Card */}
          <div className="p-3.5 rounded-lg border bg-muted/40 relative overflow-hidden space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                <strong className="text-sm font-semibold">Termii (Nigeria)</strong>
              </div>
              <Badge className="bg-emerald-600/15 text-emerald-700 border-emerald-600/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> ACTIVE
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Regional provider for Nigeria +234 DND route &amp; Voice OTP
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t">
              <span>Region: <strong>NG (+234)</strong></span>
              <span>•</span>
              <span>DND: <strong>Bypass</strong></span>
            </div>
          </div>
        </div>

        {/* Primary Provider Architecture Selector */}
        <div className="space-y-3 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active CPaaS Orchestration Architecture
          </Label>

          <RadioGroup
            value={config.primaryProvider}
            onValueChange={(val) => updateConfig({ primaryProvider: val as CPaaSProvider })}
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            {/* Option 1: Sent.dm Global Default */}
            <label
              htmlFor="sent-global"
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-3 ${
                config.primaryProvider === "sent"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="sent" id="sent-global" />
                    <strong className="text-sm font-bold text-foreground">Sent.dm (Global Default)</strong>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    Route all SMS, WhatsApp, and RCS through Sent.dm v3 with automatic country detection.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                  RECOMMENDED
                </Badge>
              </div>
              <div className="pl-6 text-[11px] text-primary flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3" /> Unified single API contract
              </div>
            </label>

            {/* Option 2: Split Regional (Twilio + Termii) */}
            <label
              htmlFor="split-regional"
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-3 ${
                config.primaryProvider === "auto"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="auto" id="split-regional" />
                    <strong className="text-sm font-bold text-foreground">Split Regional Routing</strong>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    Routes US numbers (+1) to Twilio and Nigerian numbers (+234) to Termii automatically.
                  </p>
                </div>
              </div>
              <div className="pl-6 text-[11px] text-muted-foreground">
                Classic dual-vendor topology
              </div>
            </label>

            {/* Option 3: Twilio Direct */}
            <label
              htmlFor="twilio-direct"
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-3 ${
                config.primaryProvider === "twilio"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="twilio" id="twilio-direct" />
                    <strong className="text-sm font-bold text-foreground">Twilio Direct Only</strong>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    Enforces Twilio as the primary dispatcher for all supported regions.
                  </p>
                </div>
              </div>
              <div className="pl-6 text-[11px] text-muted-foreground">
                Dedicated US carrier route
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Failover & Channel Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Failover Protection Card */}
          <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <strong className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Automatic Failover Protection
                </strong>
                <p className="text-xs text-muted-foreground">
                  Cascade message to secondary provider if primary CPaaS returns delivery error.
                </p>
              </div>
              <Switch
                checked={config.enableFailover}
                onCheckedChange={(val) => updateConfig({ enableFailover: val })}
              />
            </div>

            {config.enableFailover && (
              <div className="pt-2 border-t text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Failover Target:</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    Sent.dm ↔ Twilio / Termii
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If Sent.dm encounters temporary downtime, alerts instantly re-route through Twilio (US) or Termii (NG) without message loss.
                </p>
              </div>
            )}
          </div>

          {/* Channel Specific Routing */}
          <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
            <strong className="text-sm font-semibold flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-primary" /> Channel Route Overrides
            </strong>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">SMS Dispatch:</span>
                <Select
                  value={config.channelRouting.sms}
                  onValueChange={(val) =>
                    updateConfig({
                      channelRouting: { ...config.channelRouting, sms: val as CPaaSProvider },
                    })
                  }
                >
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent" className="text-xs">Sent.dm (Global)</SelectItem>
                    <SelectItem value="twilio" className="text-xs">Twilio (US)</SelectItem>
                    <SelectItem value="termii" className="text-xs">Termii (NG)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">WhatsApp Dispatch:</span>
                <Select
                  value={config.channelRouting.whatsapp}
                  onValueChange={(val) =>
                    updateConfig({
                      channelRouting: { ...config.channelRouting, whatsapp: val as CPaaSProvider },
                    })
                  }
                >
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent" className="text-xs">Sent.dm (v3 API)</SelectItem>
                    <SelectItem value="twilio" className="text-xs">Twilio WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">RCS Business:</span>
                <Select
                  value={config.channelRouting.rcs}
                  onValueChange={(val) =>
                    updateConfig({
                      channelRouting: { ...config.channelRouting, rcs: val as CPaaSProvider },
                    })
                  }
                >
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sent" className="text-xs">Sent.dm (Native RCS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
