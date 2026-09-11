import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldAlert,
  PhoneCall,
  Clock,
  Car,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Search,
  BookOpen,
  FileText,
  LifeBuoy,
  Phone,
  Flame,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Radio
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { DEFAULT_SERVICE_DISRUPTION_CLAUSES } from "@/lib/onboarding-sync";

interface ScriptItem {
  id: string;
  title: string;
  category: "Dispute" | "Call-In" | "Emergency" | "Owner";
  trigger: string;
  talkingPoints: string[];
  script: string;
}

const supportScripts: ScriptItem[] = [
  {
    id: "highway_dispute",
    title: "Driver Disputing Disruption ('Cut off while driving')",
    category: "Dispute",
    trigger: "Driver calls alleging vehicle was shut down while driving on highway or active road.",
    talkingPoints: [
      "Reassure customer calmly and explain the mathematical telemetry safety interlock.",
      "Inform driver that system logs confirm speed was 0 mph and engine was off at time of starter restriction.",
      "Check Traccar / Hologram telemetry timestamps to confirm parked status.",
      "Explain the overdue balance or call-in condition that caused the immobilization."
    ],
    script: "Hello [Driver Name], I understand this is stressful and I want to assist you right away. For safety reasons, Rentmaikar telematics cannot and will never shut down a vehicle while it is in motion—our system requires verified 0 mph stationary status and engine-off before starter restriction can engage. According to our telemetry log, the starter restriction was applied at [Time] while the vehicle was safely parked. This was initiated due to [overdue payment of X / pending call-in notice]. Once [payment is completed / the call-in check is processed], we can remotely release the immobilizer within minutes.",
  },
  {
    id: "call_in_refusal",
    title: "Driver Objecting to 24-Hour Call-In Directive",
    category: "Call-In",
    trigger: "Driver questions why they must present vehicle or check in within 24 hours.",
    talkingPoints: [
      "Cite Clause 3 (Vehicle Call-In & Inspection) of the signed rental agreement.",
      "Explain that routine inspections and random spot checks protect both driver and vehicle owner.",
      "Offer the nearest approved hub location and operating hours.",
      "Warn that failure to report within the 24h window triggers automatic remote starter restriction upon parking."
    ],
    script: "Under Section 3 of your signed Rentmaikar rental agreement, all drivers agree to our standard 24-hour vehicle call-in protocol. These checks ensure telematics accuracy, roadworthiness, and insurance validity. You have until [Time/Date, 24h from notice] to present the car at [Hub Location] or complete an operations verification check. If the 24 hours expire without an in-person check or approved extension, the vehicle starter will be restricted automatically when next parked.",
  },
  {
    id: "emergency_override",
    title: "Medical or Safety Emergency Exemption",
    category: "Emergency",
    trigger: "Driver has a medical emergency, hospital visit, or genuine safety hazard while vehicle is disrupted.",
    talkingPoints: [
      "Verify safety first. If in immediate personal danger, advise driver to contact emergency services (911 / 112).",
      "Support agents have authorization for a single 2-hour temporary mobilization override.",
      "Record audit reason 'emergency_override_medical' in Admin Audit Log.",
      "Instruct driver to proceed directly to safety/hospital; vehicle re-locks after 2 hours if unresolved."
    ],
    script: "Your safety and health are our absolute priority. If you or a passenger need immediate medical or police assistance, please call 911 (US) or 112 (Nigeria) right now. As an authorized support agent, I am granting an immediate 2-hour emergency ignition release. The immobilizer has been cleared now. Please get to safety. Our operations team will follow up afterwards to resolve the underlying account balance.",
  },
  {
    id: "owner_fraud_inquiry",
    title: "Vehicle Owner Inquiring on Default / Recovery",
    category: "Owner",
    trigger: "Owner asks how Rentmaikar is protecting their car when driver is 48+ hours overdue.",
    talkingPoints: [
      "Confirm the escalation ladder: 3 automated notices, phone outreach, and stationary immobilizer engagement.",
      "Show live GPS tracking and battery voltage status.",
      "Explain field recovery team dispatch if 24h call-in expires without contact.",
      "Assure owner of full insurance and contractually binding indemnification."
    ],
    script: "Hello [Owner Name], we are actively managing your [Vehicle Make/Model]. The driver is currently in payment default. In accordance with our escalation protocol, 3 automated warnings have been dispatched, and our stationary starter restriction is armed to restrict restart once the car is parked. We have active GPS coordinates at [Location], and our 24-hour call-in directive has been issued. If the driver fails to comply within 24 hours, our field recovery team will secure and retrieve your vehicle.",
  }
];

export function ServiceDisruptionDocs() {
  const [activeTab, setActiveTab] = useState("policies");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState<"All" | "USA" | "Nigeria">("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredScripts = useMemo(() => {
    return supportScripts.filter(s => {
      const matchText = (s.title + s.trigger + s.script + s.talkingPoints.join(" ")).toLowerCase();
      return matchText.includes(searchQuery.toLowerCase());
    });
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-background to-primary/5 border border-amber-500/30">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">Service Disruption &amp; Call-In Protocol Docs</h2>
              <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px]">
                Support Portal Reference
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative rules, stationary safety mandates, call-in checklists, and quick-copy dispute scripts for customer support.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <Link to="/admin/legal-template-preview">
              <ExternalLink className="h-3.5 w-3.5" />
              Legal Template Preview
            </Link>
          </Button>
          <Button asChild size="sm" variant="default" className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white">
            <Link to="/admin/catalogue">
              <Car className="h-3.5 w-3.5" />
              Catalogue Disruption Status
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 gap-1">
          <TabsTrigger value="policies" className="text-xs py-2 gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
            1. Policy &amp; Safety Mandate
          </TabsTrigger>
          <TabsTrigger value="callin" className="text-xs py-2 gap-1.5">
            <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
            2. 24h Call-In Checklist
          </TabsTrigger>
          <TabsTrigger value="scripts" className="text-xs py-2 gap-1.5">
            <LifeBuoy className="h-3.5 w-3.5 text-emerald-600" />
            3. Support Dispute Scripts
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs py-2 gap-1.5">
            <FileText className="h-3.5 w-3.5 text-purple-500" />
            4. Agreement Clauses &amp; Copy
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Policy & Safety Mandate */}
        <TabsContent value="policies" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* The Golden Safety Rule */}
            <Card className="md:col-span-3 border-amber-500/50 bg-amber-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                  <Radio className="h-4 w-4 animate-pulse text-amber-600" />
                  THE NON-NEGOTIABLE SAFETY MANDATE: STATIONARY-ONLY STARTER RESTRICTION
                </div>
              </CardHeader>
              <CardContent className="text-xs leading-relaxed space-y-2 text-foreground/90">
                <p>
                  <strong>Never in motion:</strong> Under no circumstance may any support agent, system automated cron, or telematics device cut engine power or interfere with steering or braking while a vehicle is on an active roadway.
                </p>
                <p>
                  <strong>Stationary Verification:</strong> Starter restriction commands (<code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">engineStop</code> / <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">immobilize</code>) require verified confirmation from the GPS tracker that <strong>Speed = 0 mph / kmh</strong> and <strong>Ignition is OFF</strong>. When triggered, the starter relay prevents restarting once parked.
                </p>
              </CardContent>
            </Card>

            {/* Escalation Schedule Daily */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Daily Payment Plans</span>
                  <Badge variant="secondary" className="text-[10px]">36h Grace</Badge>
                </CardTitle>
                <CardDescription className="text-xs">Schedule for daily subscription drivers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="p-2 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>+12 Hours Overdue</span>
                    <Badge variant="outline" className="text-[10px]">Warning 1</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Automated SMS + push reminder. Standard 5% late fee flagged.</p>
                </div>
                <div className="p-2 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>+24 Hours Overdue</span>
                    <Badge variant="outline" className="text-[10px] text-amber-600">Warning 2</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">IVR phone call + WhatsApp notification. 10% late fee applied.</p>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                    <span>+36 Hours Overdue</span>
                    <Badge className="bg-destructive text-[10px]">Service Disruption</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Immobilizer arms for stationary starter cut. Formal 24h call-in issued.</p>
                </div>
              </CardContent>
            </Card>

            {/* Escalation Schedule Weekly */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Weekly Payment Plans</span>
                  <Badge variant="secondary" className="text-[10px]">72h Grace</Badge>
                </CardTitle>
                <CardDescription className="text-xs">Schedule for standard weekly rental drivers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="p-2 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>+24 Hours Overdue</span>
                    <Badge variant="outline" className="text-[10px]">Warning 1</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Automated SMS + email notice. Grace period countdown starts.</p>
                </div>
                <div className="p-2 rounded bg-muted/50 border space-y-1">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>+48 Hours Overdue</span>
                    <Badge variant="outline" className="text-[10px] text-amber-600">Warning 2</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Automated IVR call + phone reachout from support agent.</p>
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                    <span>+72 Hours Overdue</span>
                    <Badge className="bg-destructive text-[10px]">Service Disruption</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Stationary starter restriction armed. 24h call-in notice sent.</p>
                </div>
              </CardContent>
            </Card>

            {/* Special Triggers: Referee & Boundary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Special Immediate Triggers</span>
                  <Badge variant="destructive" className="text-[10px]">Immediate</Badge>
                </CardTitle>
                <CardDescription className="text-xs">Non-payment triggers requiring immediate recall</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="p-2 rounded bg-destructive/10 border border-destructive/20 space-y-1">
                  <div className="font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Referee / Guarantor Fraud
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Adverse referee attestation (unauthorized driver, forged ID) qualifies for immediate recall via Negative Attestation Panel.
                  </p>
                </div>
                <div className="p-2 rounded bg-destructive/10 border border-destructive/20 space-y-1">
                  <div className="font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Boundary / Geofence Breach
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Unauthorized state border or international crossing without operations approval triggers immediate immobilization when parked.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: 24h Call-In Checklist */}
        <TabsContent value="callin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-blue-500" />
                Standard Operating Procedure: 24-Hour Call-In Directive
              </CardTitle>
              <CardDescription className="text-xs">
                Follow these exact steps when issuing, managing, and resolving a 24-hour vehicle call-in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-primary">Step 1</span>
                    <Badge variant="outline" className="text-[10px]">T-0 Hours</Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">Issue Formal Notice</h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Dispatch multi-channel Call-In Notice (SMS, email, in-app push). Specify reason (routine inspection, overdue payment, or referee review) and assign nearest verified hub.
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-amber-600">Step 2</span>
                    <Badge variant="outline" className="text-[10px]">T+12 Hours</Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">Midway Contact Audit</h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Check if driver has responded or scheduled hub inspection. If no contact, initiate voice phone call and verify vehicle telemetry (GPS ping &amp; current address).
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-destructive">Step 3</span>
                    <Badge variant="outline" className="text-[10px]">T+24 Hours</Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">Engage Starter Restriction</h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    If 24h expires without presentation or approved extension, engage stationary starter restriction (<code className="bg-muted px-1 py-0.5 rounded text-[10px]">engineStop</code>). Alert recovery partner.
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-emerald-600">Step 4</span>
                    <Badge variant="outline" className="text-[10px]">Resolution</Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">Verification &amp; Release</h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Once driver settles balance or physical inspection completes, verify receipt in database, then trigger <code className="bg-muted px-1 py-0.5 rounded text-[10px]">engineResume</code>.
                  </p>
                </div>
              </div>

              {/* Call-In SMS & Email Copy */}
              <div className="p-4 rounded-xl border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    Standard Call-In Notice Template (SMS / WhatsApp)
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => copyToClipboard(
                      "callin_msg",
                      "Rentmaikar OFFICIAL CALL-IN NOTICE: Driver {first_name}, you are required to check in and present vehicle {plate_number} at an approved hub within 24 hours (Deadline: {deadline}). Failure to comply within 24h triggers automatic service disruption (stationary starter lock) per Section 3 of your rental contract. Call operations now: {helpline}."
                    )}
                  >
                    {copiedId === "callin_msg" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy SMS
                  </Button>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground bg-card p-3 rounded-lg border">
                  Rentmaikar OFFICIAL CALL-IN NOTICE: Driver {"{first_name}"}, you are required to check in and present vehicle {"{plate_number}"} at an approved hub within 24 hours (Deadline: {"{deadline}"}). Failure to comply within 24h triggers automatic service disruption (stationary starter lock) per Section 3 of your rental contract. Call operations now: {"{helpline}"}.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Support Dispute Scripts */}
        <TabsContent value="scripts" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search scripts, dispute types, or keywords…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Showing {filteredScripts.length} interaction scripts</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredScripts.map((s) => (
              <Card key={s.id} className="border bg-card">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                        {s.category}
                      </Badge>
                      <CardTitle className="text-sm font-semibold">{s.title}</CardTitle>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => copyToClipboard(s.id, s.script)}
                    >
                      {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === s.id ? "Copied" : "Copy Talking Script"}
                    </Button>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    <strong>Trigger:</strong> {s.trigger}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-1 text-xs">
                  <div>
                    <span className="font-semibold text-foreground text-[11px] block mb-1">
                      Key Talking Points:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-[11px]">
                      {s.talkingPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wider block">
                      Scripted Customer Response:
                    </span>
                    <p className="italic text-foreground text-xs leading-relaxed">
                      "{s.script}"
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 4: Agreement Clauses & Copy */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Jurisdiction:</span>
              <Button
                size="sm"
                variant={regionFilter === "USA" ? "default" : "outline"}
                onClick={() => setRegionFilter("USA")}
                className="h-7 text-xs px-2.5"
              >
                USA Agreement
              </Button>
              <Button
                size="sm"
                variant={regionFilter === "Nigeria" ? "default" : "outline"}
                onClick={() => setRegionFilter("Nigeria")}
                className="h-7 text-xs px-2.5"
              >
                Nigeria Agreement
              </Button>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Link to="/admin/legal-template-preview">
                <ExternalLink className="h-3.5 w-3.5" />
                Open Template Preview
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Clause 3 USA */}
            {(regionFilter === "All" || regionFilter === "USA") && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span>🇺🇸 Clause 3 · USA Jurisdiction</span>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => copyToClipboard("usa_clause", DEFAULT_SERVICE_DISRUPTION_CLAUSES.USA.rawClauseText)}
                    >
                      {copiedId === "usa_clause" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy Clause
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Approved terms governing US rental and lease agreements.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64 rounded-md border bg-muted/20 p-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
                      {DEFAULT_SERVICE_DISRUPTION_CLAUSES.USA.rawClauseText}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Clause 3 Nigeria */}
            {(regionFilter === "All" || regionFilter === "Nigeria") && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span>🇳🇬 Clause 3 · Nigerian Jurisdiction</span>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => copyToClipboard("ng_clause", DEFAULT_SERVICE_DISRUPTION_CLAUSES.Nigeria.rawClauseText)}
                    >
                      {copiedId === "ng_clause" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy Clause
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Approved terms governing Nigerian rental and lease agreements.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64 rounded-md border bg-muted/20 p-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
                      {DEFAULT_SERVICE_DISRUPTION_CLAUSES.Nigeria.rawClauseText}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ServiceDisruptionDocs;
