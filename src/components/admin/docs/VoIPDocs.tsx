import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Shield, Clock, ArrowRight, AlertTriangle, Users, Mic, PhoneOff } from "lucide-react";

const outboundCalls = [
  {
    title: "Payment Default – Day 1 Warning",
    category: "Collections",
    priority: "high",
    trigger: "process-payment-defaults (auto)",
    region: "Both",
    description: "Initial automated call when payment becomes overdue. IVR menu offers payment options and agent transfer.",
    ivrFlow: [
      "Greeting: 'Hello {name}, this is Rentmaikar regarding your overdue payment of {amount}.'",
      "Press 1: Make payment now (transfers to payment gateway)",
      "Press 2: Request extension (records request, notifies admin)",
      "Press 3: Speak to an agent (transfers to support queue)",
      "No response: Leaves voicemail, escalates to SMS",
    ],
  },
  {
    title: "Payment Default – Day 2 Escalation",
    category: "Collections",
    priority: "critical",
    trigger: "process-payment-defaults (auto)",
    region: "Both",
    description: "Second-day escalation with more urgent messaging and vehicle deactivation warning.",
    ivrFlow: [
      "Greeting: 'URGENT: Your payment of {amount} is now {hoursOverdue} hours overdue.'",
      "Warning: 'Vehicle deactivation may occur within 24 hours.'",
      "Press 1: Make payment now",
      "Press 2: Dispute this charge (creates dispute record, pauses deactivation timer)",
      "Press 3: Speak to collections team",
    ],
  },
  {
    title: "Payment Default – Day 3 Final Notice",
    category: "Collections",
    priority: "critical",
    trigger: "process-payment-defaults (auto)",
    region: "Both",
    description: "Final automated call before vehicle deactivation. No extension option available.",
    ivrFlow: [
      "Greeting: 'FINAL NOTICE: Vehicle {vehiclePlate} will be deactivated today.'",
      "Press 1: Make immediate payment to prevent deactivation",
      "Press 2: Speak to a supervisor",
      "No response: Deactivation proceeds when vehicle is parked (speed < 2 mph)",
    ],
  },
  {
    title: "Document Expiry Reminder (30 days)",
    category: "Compliance",
    priority: "normal",
    trigger: "expiry-notification-ivr edge function",
    region: "Both",
    description: "Advance reminder call for documents expiring in 30 days. Friendly tone with upload instructions.",
    ivrFlow: [
      "Greeting: 'Hi {name}, your {documentType} expires on {expiryDate}.'",
      "Press 1: Receive upload link via SMS",
      "Press 2: Hear renewal instructions",
      "Press 3: Connect to support for assistance",
    ],
  },
  {
    title: "Document Expiry – 7-Day Warning",
    category: "Compliance",
    priority: "high",
    trigger: "expiry-notification-ivr edge function",
    region: "Both",
    description: "Urgent reminder with rental suspension warning if document is not renewed.",
    ivrFlow: [
      "Greeting: 'WARNING: Your {documentType} expires in 7 days.'",
      "Warning: 'Failure to renew will result in rental suspension.'",
      "Press 1: Upload now (sends SMS link)",
      "Press 2: Schedule renewal appointment",
      "Press 3: Speak to compliance team",
    ],
  },
  {
    title: "Vehicle Return Reminder",
    category: "Fleet",
    priority: "normal",
    trigger: "vehicle-return-ivr edge function",
    region: "Both",
    description: "24-hour advance reminder for scheduled vehicle returns with confirmation/extension options.",
    ivrFlow: [
      "Greeting: 'Hi {name}, your vehicle ({vehicleName}) is due for return tomorrow.'",
      "Press 1: Confirm return",
      "Press 2: Request extension (subject to approval)",
      "Press 3: Report an issue with the vehicle",
      "Press 4: Speak to fleet management",
    ],
  },
  {
    title: "Emergency Shutdown Warning (Moving)",
    category: "Safety",
    priority: "critical",
    trigger: "shutdown-warning-ivr edge function",
    region: "Both",
    description: "Urgent call when vehicle shutdown is triggered while vehicle is in motion. Safety-first approach.",
    ivrFlow: [
      "ALERT: 'SAFETY WARNING: Your vehicle is scheduled for remote shutdown.'",
      "'Please pull over to a safe location immediately.'",
      "'The shutdown will execute once the vehicle is safely stopped.'",
      "Press 1: I have pulled over safely",
      "Press 2: Dispute this action (pauses shutdown, creates admin review)",
      "Press 9: Emergency – connect to support immediately",
    ],
  },
  {
    title: "Emergency Shutdown Warning (Parked)",
    category: "Safety",
    priority: "critical",
    trigger: "shutdown-warning-ivr edge function",
    region: "Both",
    description: "Shutdown countdown call when vehicle is already parked. 5-minute grace period with dispute option.",
    ivrFlow: [
      "ALERT: 'Your vehicle will be remotely deactivated in 5 minutes.'",
      "'To prevent this, make your overdue payment now.'",
      "Press 1: Make payment now (payment link via SMS)",
      "Press 2: Dispute this shutdown (pauses timer, status → 'disputed')",
      "Press 3: Speak to support",
      "No response after 5 min: Vehicle deactivated automatically",
    ],
  },
];

const inboundCalls = [
  {
    title: "Driver Calls Support",
    category: "Support",
    priority: "normal",
    trigger: "Inbound to support number",
    description: "Role-based IVR authenticated via phone number lookup. Drivers get context-aware menus based on active rental status.",
    ivrFlow: [
      "Auto-greeting with role detection: 'Welcome back, {name}.'",
      "If active payment default: 'You have an outstanding balance of {amount}.'",
      "Press 1: Payment support",
      "Press 2: Vehicle issue (breakdown, accident)",
      "Press 3: Document upload assistance",
      "Press 4: Speak to a live agent",
      "Press 0: Emergency services",
    ],
  },
  {
    title: "Owner Calls Support",
    category: "Support",
    priority: "normal",
    trigger: "Inbound to support number",
    description: "Owner-specific menu with earnings inquiries, vehicle status, and driver management options.",
    ivrFlow: [
      "Auto-greeting: 'Welcome, {name}. You have {vehicleCount} active vehicles.'",
      "Press 1: Earnings and payout inquiries",
      "Press 2: Vehicle status and tracking",
      "Press 3: Driver issues or complaints",
      "Press 4: Speak to account manager",
    ],
  },
  {
    title: "Accident/Breakdown Emergency",
    category: "Safety",
    priority: "critical",
    trigger: "IVR emergency option or IoT detection",
    description: "Emergency protocol triggered by driver input or automatic IoT accident detection. Dispatches support and notifies stakeholders.",
    ivrFlow: [
      "Priority routing: 'Connecting you to emergency support immediately.'",
      "Auto-SMS sent to: Admin, Owner, Roadside assistance",
      "GPS location captured from IoT device or phone",
      "Incident record auto-created in system",
      "Follow-up call scheduled for 30 minutes later",
    ],
  },
];

const voipFeatures = [
  {
    title: "Browser-Based Calling",
    description: "Admin Call Center provides in-browser calling via Twilio REST API. No phone hardware required.",
    details: "Stateless, database-driven architecture compatible with Deno-based edge functions.",
  },
  {
    title: "Role-Based Permissions",
    description: "Strict calling permissions enforced by role.",
    details: "Drivers → Support only. Owners → Assigned drivers (verified via active rental). Admins → Global access + conference.",
  },
  {
    title: "Conference Rooms",
    description: "Multi-party conference calls for dispute resolution and complex cases.",
    details: "Admin creates room, adds participants. Mute/unmute and kick controls per participant.",
  },
  {
    title: "Call Recording",
    description: "Per-call recording with consent notification and secure storage.",
    details: "Recordings stored in call-recordings bucket. Playback available in Call History with admin-only access.",
  },
  {
    title: "Incoming Call Alerts",
    description: "Real-time browser notifications for incoming calls with accept/decline/escalate options.",
    details: "If no answer within 30 seconds, call is escalated to next available agent or voicemail.",
  },
  {
    title: "Voicemail System",
    description: "Automated voicemail when calls go unanswered, with transcription and notification.",
    details: "Voicemail stored in database with audio URL. Admin notified via Unified Inbox.",
  },
];

const businessHours = [
  { region: "USA", hours: "9:00 AM – 9:00 PM ET", timezone: "America/New_York", flag: "🇺🇸" },
  { region: "Nigeria", hours: "8:00 AM – 8:00 PM WAT", timezone: "Africa/Lagos", flag: "🇳🇬" },
];

const voiceLocalization = [
  { region: "USA (English)", voice: "Polly.Joanna", engine: "neural" },
  { region: "USA (Spanish)", voice: "Polly.Lupe", engine: "neural" },
  { region: "Nigeria (English)", voice: "Polly.Aditi", engine: "standard" },
  { region: "Nigeria (Pidgin)", voice: "Custom TTS", engine: "—" },
  { region: "Nigeria (Yoruba)", voice: "Custom TTS", engine: "—" },
  { region: "Nigeria (Hausa)", voice: "Custom TTS", engine: "—" },
];

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-primary text-primary-foreground",
};

export const VoIPDocs = () => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Phone className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">VoIP & IVR System Documentation</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Complete reference for voice calling, IVR flows, call center features, and regional voice configuration.
        </p>

        {/* Business Hours */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Business Hours (Auto-Enforced)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {businessHours.map((bh) => (
              <div key={bh.region} className="p-4 rounded-lg bg-muted flex items-center gap-3">
                <span className="text-2xl">{bh.flag}</span>
                <div>
                  <p className="font-medium">{bh.region}</p>
                  <p className="text-sm text-muted-foreground">{bh.hours}</p>
                  <p className="text-xs text-muted-foreground">{bh.timezone}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Calls outside business hours are routed to SMS/WhatsApp fallback via the escalation ladder.
          </p>
        </div>

        {/* Voice Localization */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Mic className="h-4 w-4" /> Voice Localization (TTS)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-semibold">Region / Language</th>
                  <th className="text-left p-3 font-semibold">Voice</th>
                  <th className="text-left p-3 font-semibold">Engine</th>
                </tr>
              </thead>
              <tbody>
                {voiceLocalization.map((v) => (
                  <tr key={v.region} className="border-b border-border/50">
                    <td className="p-3 font-medium">{v.region}</td>
                    <td className="p-3"><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{v.voice}</code></td>
                    <td className="p-3 text-muted-foreground">{v.engine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Call Center Features */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" /> Call Center Features
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {voipFeatures.map((f) => (
              <Card key={f.title} className="p-4">
                <h4 className="font-semibold mb-1">{f.title}</h4>
                <p className="text-sm text-muted-foreground mb-2">{f.description}</p>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">{f.details}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Call Use Cases */}
        <Tabs defaultValue="outbound" className="space-y-4">
          <TabsList>
            <TabsTrigger value="outbound">Outbound IVR ({outboundCalls.length})</TabsTrigger>
            <TabsTrigger value="inbound">Inbound IVR ({inboundCalls.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="outbound" className="space-y-4">
            {outboundCalls.map((call, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{call.title}</h4>
                  <Badge variant="secondary">{call.category}</Badge>
                  <Badge variant="outline">{call.region}</Badge>
                  <Badge className={priorityColors[call.priority]}>{call.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{call.description}</p>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Trigger: <code className="bg-muted px-1 rounded">{call.trigger}</code>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">IVR Flow:</p>
                  <div className="space-y-1">
                    {call.ivrFlow.map((step, j) => (
                      <div key={j} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">{j + 1}.</span>
                        <span className="font-mono text-xs">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="inbound" className="space-y-4">
            {inboundCalls.map((call, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{call.title}</h4>
                  <Badge variant="secondary">{call.category}</Badge>
                  <Badge className={priorityColors[call.priority]}>{call.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{call.description}</p>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Trigger: <code className="bg-muted px-1 rounded">{call.trigger}</code>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">IVR Flow:</p>
                  <div className="space-y-1">
                    {call.ivrFlow.map((step, j) => (
                      <div key={j} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0">{j + 1}.</span>
                        <span className="font-mono text-xs">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
