import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Phone as PhoneIcon, Globe, Send, AlertTriangle, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { EventTemplateMatrix } from "./EventTemplateMatrix";

const smsUseCases = [
  {
    title: "Payment Reminder (Pre-Due)",
    category: "Automation",
    region: "Both",
    priority: "high",
    trigger: "pg_cron – process-predue-reminders",
    description: "Sent 24 hours before daily/weekly payment is due to reduce defaults.",
    sample: `Hi {firstName}, your {frequency} payment of {amount} is due tomorrow. Ensure your account is funded to avoid service interruption. – Rentmaikar`,
  },
  {
    title: "Payment Default Notice",
    category: "Automation",
    region: "Both",
    priority: "critical",
    trigger: "pg_cron – process-payment-defaults",
    description: "Escalating SMS series (Day 1, 2, 3) when payment is overdue. Follows multi-channel escalation ladder.",
    sample: `URGENT: Your payment of {amount} is {hoursOverdue}h overdue. Vehicle deactivation may occur. Pay now or call support: {supportNumber}. – Rentmaikar`,
  },
  {
    title: "Document Expiry Warning",
    category: "Automation",
    region: "Both",
    priority: "high",
    trigger: "pg_cron – process-expiry-notifications (8 AM UTC)",
    description: "Sent at 30, 15, 7, and 5 days before document expiration (license, insurance, registration).",
    sample: `{firstName}, your {documentType} expires in {daysRemaining} days. Upload a renewal at {uploadLink} to avoid rental suspension. – Rentmaikar`,
  },
  {
    title: "Vehicle Return Reminder",
    category: "Automation",
    region: "Both",
    priority: "normal",
    trigger: "vehicle-return-reminder edge function",
    description: "24-hour advance reminder for scheduled vehicle returns with confirmation/extension options.",
    sample: `Hi {firstName}, your vehicle ({vehicleName}) is due for return tomorrow at {returnTime}. Reply CONFIRM to acknowledge or EXTEND to request an extension. – Rentmaikar`,
  },
  {
    title: "2FA Verification Code",
    category: "Security",
    region: "Both",
    priority: "critical",
    trigger: "send-2fa-code edge function",
    description: "Time-limited OTP for login and sensitive operations. Expires in 5 minutes.",
    sample: `Your Rentmaikar verification code is {code}. Expires in 5 minutes. Do not share this code with anyone.`,
  },
  {
    title: "Approval Notification",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "send-approval-notification edge function",
    description: "Sent when a driver or owner application is approved by admin.",
    sample: `Congratulations {firstName}! Your {applicationType} application has been approved. Log in to get started: {dashboardLink} – Rentmaikar`,
  },
  {
    title: "Incident Alert",
    category: "Safety",
    region: "Both",
    priority: "critical",
    trigger: "send-incident-notification edge function",
    description: "Immediate notification to admin and relevant parties when an incident is reported.",
    sample: `ALERT: Incident reported by {driverName} on vehicle {vehiclePlate}. Type: {incidentType}. Location: {location}. Review in admin portal. – Rentmaikar`,
  },
  {
    title: "IoT Accident Detection",
    category: "Safety",
    region: "Both",
    priority: "critical",
    trigger: "iot-accident-detection edge function",
    description: "Auto-triggered when IoT device detects sudden deceleration or impact. Sends to driver, owner, and admin.",
    sample: `EMERGENCY: Possible accident detected for vehicle {vehiclePlate} at {location}. Emergency services may be contacted. If safe, reply OK. – Rentmaikar`,
  },
  {
    title: "Price Negotiation Status Update",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "usePriceNegotiations hook → send-sms-notification",
    description: "SMS sent to drivers and owners when a price negotiation is submitted, approved, rejected, counter-offered, locked, or modified.",
    sample: `Rentmaikar: Your price negotiation for {vehicleName} has been approved. New {frequency} rate: {amount}. View details in your dashboard.`,
  },
  {
    title: "Negotiation Counter Offer",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "Admin action via usePriceNegotiations",
    description: "Notifies the user that the admin has proposed a counter offer to their negotiation request.",
    sample: `Rentmaikar: Counter offer for {vehicleName}. Your request: {originalRate}. Counter: {counterRate}/{frequency}. Review in your dashboard.`,
  },
  {
    title: "Price Locked Confirmation",
    category: "Transactional",
    region: "Both",
    priority: "normal",
    trigger: "Admin locks price via usePriceNegotiations",
    description: "Confirms that the negotiated rate has been finalized and locked. Modification requires a formal request.",
    sample: `Rentmaikar: Your {frequency} rate of {amount} for {vehicleName} is now locked. To modify, submit a change request in your dashboard.`,
  },
  {
    title: "Modification Request Processed",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "Admin processes modification via usePriceNegotiations",
    description: "Sent when an admin approves or denies a price modification request on a locked rate.",
    sample: `Rentmaikar: Your price modification for {vehicleName} has been {approved/denied}. {New rate: amount | Current rate unchanged}. – Rentmaikar`,
  },
];

const whatsappUseCases = [
  {
    title: "Inbound Keyword Commands",
    category: "Interactive",
    region: "Both",
    priority: "normal",
    trigger: "whatsapp-commands edge function",
    description: "Drivers can text keywords for self-service: PAY (payment link), STATUS (rental status), HELP (support menu), DOCS (document upload link).",
    sample: `Driver sends: "PAY"\nBot responds: "💳 Payment Portal\nYour current balance: {amount}\nPay here: {paymentLink}\nReply HELP for more options."`,
  },
  {
    title: "NLU Intent Classification",
    category: "AI",
    region: "Both",
    priority: "normal",
    trigger: "whatsapp-commands NLU engine",
    description: "Natural language understanding classifies 14 intents (vehicle_problem, rental_extend, payment_issue, emergency, etc.) when exact keywords don't match.",
    sample: `Driver sends: "My car is making a weird noise"\nClassified as: vehicle_problem\nBot responds: "🔧 We understand you're having a vehicle issue. A support agent will contact you shortly. For emergencies, call {supportNumber}."`,
  },
  {
    title: "Emergency Detection (Multi-Language)",
    category: "Safety",
    region: "Nigeria",
    priority: "critical",
    trigger: "whatsapp-commands priority escalation",
    description: "Detects emergency keywords in English, Pidgin, Yoruba, and Hausa (e.g., 'ṣànǹ', 'hadari') and escalates to urgent status in the unified inbox.",
    sample: `Driver sends: "Abeg help me, accident don happen!"\nClassified as: emergency (Pidgin)\nBot responds: "🚨 EMERGENCY DETECTED\nWe're dispatching help immediately.\nStay safe. Call {emergencyNumber} if needed."`,
  },
  {
    title: "Interactive Payment Flow",
    category: "Interactive",
    region: "Both",
    priority: "high",
    trigger: "whatsapp-commands interactive flow",
    description: "Multi-step secure payment process via WhatsApp interactive buttons. Includes amount confirmation and payment method selection.",
    sample: `Step 1: "Select payment amount:"\n[Full Balance: {amount}] [Minimum: {minAmount}]\nStep 2: "Confirm payment of {selectedAmount} via {gateway}?"\n[Confirm] [Cancel]`,
  },
  {
    title: "Document Upload via Media",
    category: "Interactive",
    region: "Both",
    priority: "normal",
    trigger: "whatsapp-commands media handler",
    description: "Drivers can send photos/documents via WhatsApp. Images are auto-stored in structured storage buckets and linked to their profile.",
    sample: `Driver sends: [Photo of driver's license]\nBot responds: "✅ Document received!\nType: Image\nWe'll review your document within 24 hours. You'll be notified once verified."`,
  },
  {
    title: "Location Sharing → Telemetry Update",
    category: "Tracking",
    region: "Both",
    priority: "normal",
    trigger: "whatsapp-commands location handler",
    description: "When a driver shares their live location, it updates the vehicle telemetry in real-time for fleet tracking.",
    sample: `Driver shares: [Live Location]\nBot responds: "📍 Location updated!\nLat: {lat}, Lng: {lng}\nYour vehicle's position has been updated on the fleet map."`,
  },
  {
    title: "Negotiation Submitted",
    category: "Transactional",
    region: "Both",
    priority: "normal",
    trigger: "usePriceNegotiations hook (auto-send on submission)",
    description: "Automated WhatsApp message confirming receipt of a price negotiation request from a driver or owner.",
    sample: `📋 Negotiation Submitted – Rentmaikar\n\nHi {firstName}, your price negotiation request has been submitted.\n\n🚗 Vehicle: {vehicleName}\n💰 Requested rate: {amount}/{frequency}\n\nOur team will review and respond within 24 hours.`,
  },
  {
    title: "Negotiation Approved / Rejected",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "Admin action via usePriceNegotiations",
    description: "Notifies the user when admin approves or rejects a negotiation. Includes rate details and next steps.",
    sample: `✅ Price Approved – Rentmaikar\n\nGreat news, {firstName}! Your negotiated rate has been approved.\n\n🚗 Vehicle: {vehicleName}\n💰 Approved {frequency} rate: {amount}\n\nThis rate is now locked and active.`,
  },
  {
    title: "Negotiation Counter Offer",
    category: "Interactive",
    region: "Both",
    priority: "high",
    trigger: "Admin counter-offer via usePriceNegotiations",
    description: "Sends the user a counter-offer with original vs proposed rates. Directs them to the dashboard to respond.",
    sample: `🔄 Counter Offer – Rentmaikar\n\nHi {firstName}, the admin has proposed a counter offer for {vehicleName}.\n\nYour request: {originalRate}/{frequency}\nCounter offer: {counterRate}/{frequency}\n\nPlease review in your dashboard.`,
  },
  {
    title: "Price Locked Notification",
    category: "Transactional",
    region: "Both",
    priority: "normal",
    trigger: "Admin locks price via usePriceNegotiations",
    description: "Confirms the rate has been finalized and locked. Modification requires a formal modification request.",
    sample: `🔒 Price Locked – Rentmaikar\n\nHi {firstName}, the {frequency} rate for {vehicleName} has been finalized.\n\n💰 Locked rate: {amount}/{frequency}\n\nThis rate cannot be modified without a formal request.`,
  },
  {
    title: "Modification Request / Processed",
    category: "Transactional",
    region: "Both",
    priority: "high",
    trigger: "usePriceNegotiations modification flow",
    description: "Sent when a modification to a locked price is requested and again when the admin processes it (approved/denied).",
    sample: `✅ Modification Approved – Rentmaikar\n\nHi {firstName}, your price modification for {vehicleName} has been approved.\n\n💰 New rate: {amount}\n\nThe updated rate is now active.`,
  },
];

const regionProviders = [
  { region: "Global / Universal", sms: "Sent.dm (v3)", whatsapp: "Sent.dm (v3)", voice: "Twilio / Termii", rcs: "Sent.dm (v3)", flag: "🌐", prefix: "Any E.164" },
  { region: "USA", sms: "Sent.dm / Twilio", whatsapp: "Sent.dm / Twilio", voice: "Twilio", rcs: "Sent.dm", flag: "🇺🇸", prefix: "+1" },
  { region: "Nigeria", sms: "Sent.dm / Termii", whatsapp: "Sent.dm / Termii", voice: "Termii", rcs: "Sent.dm", flag: "🇳🇬", prefix: "+234" },
];

const escalationLadder = [
  { step: 1, channel: "Voice Call", icon: "📞", description: "Primary contact attempt during business hours" },
  { step: 2, channel: "SMS", icon: "💬", description: "Fallback if call fails or outside business hours" },
  { step: 3, channel: "WhatsApp", icon: "📱", description: "Rich media fallback with interactive options" },
  { step: 4, channel: "Email", icon: "📧", description: "Final fallback with full documentation" },
];

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-primary text-primary-foreground",
};

export const MessagingDocs = () => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">SMS & WhatsApp Documentation</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Complete reference for all messaging use cases, providers, and escalation flows across regions.
        </p>

        {/* Region Provider Matrix */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4" /> Regional Provider Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-semibold">Region</th>
                  <th className="text-left p-3 font-semibold">Prefix</th>
                  <th className="text-left p-3 font-semibold">SMS Provider</th>
                  <th className="text-left p-3 font-semibold">WhatsApp</th>
                  <th className="text-left p-3 font-semibold">Voice</th>
                </tr>
              </thead>
              <tbody>
                {regionProviders.map((p) => (
                  <tr key={p.region} className="border-b border-border/50">
                    <td className="p-3 font-medium">{p.flag} {p.region}</td>
                    <td className="p-3 font-mono text-xs">{p.prefix}</td>
                    <td className="p-3"><Badge variant="outline">{p.sms}</Badge></td>
                    <td className="p-3"><Badge variant="outline">{p.whatsapp}</Badge></td>
                    <td className="p-3"><Badge variant="outline">{p.voice}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Escalation Ladder */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Multi-Channel Escalation Ladder
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {escalationLadder.map((step, i) => (
              <div key={step.step} className="flex items-center gap-2">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  <span className="text-lg">{step.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{step.channel}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {i < escalationLadder.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <Tabs defaultValue="sms" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sms">SMS Use Cases ({smsUseCases.length})</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp Use Cases ({whatsappUseCases.length})</TabsTrigger>
            <TabsTrigger value="events">Event Mapping</TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="space-y-4">
            {smsUseCases.map((uc, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{uc.title}</h4>
                  <Badge variant="secondary">{uc.category}</Badge>
                  <Badge variant="outline">{uc.region}</Badge>
                  <Badge className={priorityColors[uc.priority]}>{uc.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{uc.description}</p>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Trigger: <code className="bg-muted px-1 rounded">{uc.trigger}</code>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Sample Message:</p>
                  <pre className="text-sm whitespace-pre-wrap font-mono">{uc.sample}</pre>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4">
            {whatsappUseCases.map((uc, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{uc.title}</h4>
                  <Badge variant="secondary">{uc.category}</Badge>
                  <Badge variant="outline">{uc.region}</Badge>
                  <Badge className={priorityColors[uc.priority]}>{uc.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{uc.description}</p>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Trigger: <code className="bg-muted px-1 rounded">{uc.trigger}</code>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Sample Message:</p>
                  <pre className="text-sm whitespace-pre-wrap font-mono">{uc.sample}</pre>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="events">
            <EventTemplateMatrix />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
