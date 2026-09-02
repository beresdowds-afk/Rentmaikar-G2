import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Send, BarChart3, Shield, Clock, ArrowRight, CheckCircle, AlertTriangle } from "lucide-react";

const transactionalEmails = [
  {
    title: "Welcome Email (Driver)",
    template: "driver",
    category: "welcome",
    priority: "high",
    trigger: "Post-approval via send-outbound-email",
    description: "Onboarding email sent after driver application approval. Includes 3-step getting started guide and required documents checklist.",
    sample: {
      to: "john.doe@email.com",
      data: {
        firstName: "John",
        steps: ["Complete Profile", "Upload Documents", "Browse Vehicles"],
        requirements: ["Valid Driver's License", "Uber/Lyft Approval", "Background Check"],
      },
    },
  },
  {
    title: "Welcome Email (Owner)",
    template: "owner",
    category: "welcome",
    priority: "high",
    trigger: "Post-approval via send-outbound-email",
    description: "Onboarding email for vehicle owners with IoT device setup instructions and earnings overview.",
    sample: {
      to: "owner@email.com",
      data: {
        firstName: "Sarah",
        steps: ["List Your Vehicle", "Install IoT Device", "Start Earning"],
        requirements: ["Vehicle Registration", "Insurance Certificate", "Vehicle Photos"],
      },
    },
  },
  {
    title: "Payment Receipt",
    template: "receipt",
    category: "payment",
    priority: "normal",
    trigger: "Post-payment processing",
    description: "Transaction confirmation with amount, payment method, vehicle details, and downloadable PDF receipt link.",
    sample: {
      to: "driver@email.com",
      data: {
        transactionId: "PAY-123456789",
        amount: "$48.00",
        paymentMethod: "Visa ****4242",
        vehicleName: "2023 Toyota Camry",
      },
    },
  },
  {
    title: "Owner Payout Notification",
    template: "owner_payout",
    category: "payment",
    priority: "normal",
    trigger: "process-owner-payouts (weekly, Fridays)",
    description: "Weekly earnings summary sent to owners after payout is processed. Includes breakdown by vehicle.",
    sample: {
      to: "owner@email.com",
      data: {
        firstName: "Michael",
        totalEarnings: "$1,200.00",
        period: "Jan 8 – Jan 14, 2024",
        vehicleBreakdown: [
          { name: "2023 Toyota Camry", earnings: "$600.00" },
          { name: "2022 Honda Civic", earnings: "$600.00" },
        ],
      },
    },
  },
  {
    title: "Document Expiry Warning",
    template: "document_expiry_warning",
    category: "document",
    priority: "high",
    trigger: "process-expiry-notifications (30/15/7/5 days)",
    description: "Tiered email alerts for expiring documents (license, insurance, registration). Includes direct upload link.",
    sample: {
      to: "owner@email.com",
      data: {
        documentType: "Insurance Certificate",
        expiryDate: "February 15, 2024",
        daysRemaining: "15",
      },
    },
  },
  {
    title: "Police Report Required (Nigeria)",
    template: "police_report_required",
    category: "nigeria",
    priority: "critical",
    trigger: "Admin-initiated for Nigerian drivers",
    description: "Nigeria-specific compliance email requiring police character certificate upload with formatted NIN.",
    sample: {
      to: "driver@email.ng",
      data: {
        firstName: "Chidi",
        deadline: "January 30, 2024",
        formattedNin: "123-4567-8910",
      },
    },
  },
  {
    title: "Incident Report Notification",
    template: "incident_notification",
    category: "safety",
    priority: "critical",
    trigger: "send-incident-notification edge function",
    description: "Immediate email to admin and stakeholders when an incident is reported, with photos and location details.",
    sample: {
      to: "admin@rentmaikar.com",
      data: {
        incidentType: "Collision",
        driverName: "John Doe",
        vehiclePlate: "ABC-1234",
        location: "123 Main St, Baltimore, MD",
      },
    },
  },
  {
    title: "Agreement Signing Request",
    template: "agreement_signing",
    category: "legal",
    priority: "high",
    trigger: "send-agreement-email edge function",
    description: "Email with link to digitally sign rental or rent-to-own agreement. Sent to driver and owner.",
    sample: {
      to: "driver@email.com",
      data: {
        agreementType: "Rental Agreement",
        vehicleName: "2023 Toyota Camry",
        signingLink: "https://rentmaikar.com/agreements/sign/abc123",
      },
    },
  },
  {
    title: "Daily Admin Report",
    template: "daily_report",
    category: "admin",
    priority: "normal",
    trigger: "generate-daily-tasks (7 AM UTC daily)",
    description: "Automated daily digest with new applications, payment defaults, expiring documents, and fleet status.",
    sample: {
      to: "admin@rentmaikar.com",
      data: {
        newApplications: 5,
        activeDefaults: 3,
        expiringDocuments: 7,
        activeVehicles: 156,
      },
    },
  },
  {
    title: "Negotiation Submitted",
    template: "negotiation_submitted",
    category: "negotiation",
    priority: "normal",
    trigger: "usePriceNegotiations hook (auto-send)",
    description: "Confirmation email sent to driver or owner when they submit a price negotiation request. Includes vehicle, requested rate, and expected response time.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        requestedRate: "$45.00/daily",
        userType: "driver",
      },
    },
  },
  {
    title: "Negotiation Approved",
    template: "negotiation_approved",
    category: "negotiation",
    priority: "high",
    trigger: "Admin approval via usePriceNegotiations",
    description: "Notifies the user that their negotiated rate has been approved and is now active on the rental.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        approvedRate: "$42.00/daily",
      },
    },
  },
  {
    title: "Negotiation Rejected",
    template: "negotiation_rejected",
    category: "negotiation",
    priority: "high",
    trigger: "Admin rejection via usePriceNegotiations",
    description: "Informs the user their negotiation was declined, with optional reason and an invitation to resubmit.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        requestedRate: "$30.00/daily",
        reason: "Rate below minimum threshold for this vehicle category.",
      },
    },
  },
  {
    title: "Negotiation Counter Offer",
    template: "negotiation_counter_offer",
    category: "negotiation",
    priority: "high",
    trigger: "Admin counter-offer via usePriceNegotiations",
    description: "Presents the user with the admin's counter offer, showing original vs proposed rates with a CTA to review.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        originalRate: "$35.00/daily",
        counterRate: "$40.00/daily",
      },
    },
  },
  {
    title: "Price Locked Confirmation",
    template: "negotiation_locked",
    category: "negotiation",
    priority: "normal",
    trigger: "Admin locks price via usePriceNegotiations",
    description: "Confirms the finalized and locked rate. Includes a note that modifications require a formal request.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        lockedRate: "$42.00/daily",
      },
    },
  },
  {
    title: "Modification Request Processed",
    template: "negotiation_modification_processed",
    category: "negotiation",
    priority: "high",
    trigger: "Admin processes modification via usePriceNegotiations",
    description: "Notifies the user of the outcome when an admin approves or denies a price modification request.",
    sample: {
      to: "user@email.com",
      data: {
        firstName: "John",
        vehicleName: "2023 Toyota Camry",
        approved: true,
        newRate: "$38.00/daily",
        adminResponse: "Rate adjusted per market review.",
      },
    },
  },
];

const bulkEmails = [
  {
    title: "Seasonal Promotion",
    template: "seasonal_promotion",
    category: "marketing",
    audience: "Active drivers",
    description: "Bulk promotional email with discount code, expiry date, and CTA. Respects suppression list.",
    sample: {
      data: {
        promoTitle: "Summer Special!",
        discount: "20%",
        promoCode: "SUMMER20",
        expiryDate: "July 31, 2024",
      },
    },
  },
  {
    title: "Platform Update Announcement",
    template: "platform_update",
    category: "announcement",
    audience: "All users",
    description: "Feature announcements, policy changes, or scheduled maintenance notifications.",
    sample: {
      data: {
        updateTitle: "New Feature: Daily Plans",
        updateMessage: "Drivers can now opt for flexible daily rental plans...",
      },
    },
  },
  {
    title: "Re-engagement Campaign",
    template: "reengagement",
    category: "marketing",
    audience: "Inactive drivers (30+ days)",
    description: "Win-back email for dormant users with personalized incentives.",
    sample: {
      data: {
        firstName: "{firstName}",
        lastActive: "{daysSinceActive} days ago",
        incentive: "First week free on your next rental",
      },
    },
  },
];

const trackingFeatures = [
  { feature: "Open Tracking", method: "1x1 transparent pixel", description: "Embedded in email HTML, fires on load to record open event with IP and user-agent" },
  { feature: "Click Tracking", method: "Redirect URL", description: "All links rewritten to pass through /email-tracking/click/{messageId}?url={target}" },
  { feature: "Bounce Handling", method: "Webhook (POST)", description: "Hard bounces auto-add recipients to suppression list. Soft bounces tracked for retry." },
  { feature: "Complaint Handling", method: "Webhook (POST)", description: "Spam complaints immediately suppress recipient and update email_logs status." },
  { feature: "Conversion Tracking", method: "URL pattern matching", description: "Links to /dashboard, /payment, /register, /upload, /subscribe flagged as conversions." },
  { feature: "Suppression List", method: "Pre-send check", description: "All outbound emails checked against active suppression list before sending." },
  { feature: "Analytics Aggregation", method: "Daily rollup", description: "Bounce and complaint counts aggregated into email_analytics table by date/category." },
];

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-primary text-primary-foreground",
};

export const EmailDocs = () => {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Email System Documentation</h2>
        </div>
        <p className="text-muted-foreground mb-6">
          Complete reference for transactional emails, bulk campaigns, tracking infrastructure, and analytics powered by Resend.
        </p>

        {/* Architecture Overview */}
        <div className="mb-8 p-4 rounded-lg bg-muted">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Send className="h-4 w-4" /> Architecture Overview
          </h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-background">
              <p className="font-medium mb-1">📤 Outbound</p>
              <p className="text-muted-foreground">send-outbound-email edge function → Resend API → Recipient</p>
            </div>
            <div className="p-3 rounded-lg bg-background">
              <p className="font-medium mb-1">📥 Inbound</p>
              <p className="text-muted-foreground">Resend webhook → email-webhook edge function → Unified Inbox</p>
            </div>
            <div className="p-3 rounded-lg bg-background">
              <p className="font-medium mb-1">📊 Tracking</p>
              <p className="text-muted-foreground">email-tracking edge function → Pixel opens, click redirects, bounce/complaint webhooks</p>
            </div>
          </div>
        </div>

        {/* Tracking Infrastructure */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Tracking Infrastructure
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-semibold">Feature</th>
                  <th className="text-left p-3 font-semibold">Method</th>
                  <th className="text-left p-3 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {trackingFeatures.map((f) => (
                  <tr key={f.feature} className="border-b border-border/50">
                    <td className="p-3 font-medium">{f.feature}</td>
                    <td className="p-3"><Badge variant="outline">{f.method}</Badge></td>
                    <td className="p-3 text-muted-foreground">{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Email Use Cases */}
        <Tabs defaultValue="transactional" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transactional">Transactional ({transactionalEmails.length})</TabsTrigger>
            <TabsTrigger value="bulk">Bulk / Campaign ({bulkEmails.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="transactional" className="space-y-4">
            {transactionalEmails.map((email, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{email.title}</h4>
                  <Badge variant="secondary">{email.category}</Badge>
                  <Badge className={priorityColors[email.priority]}>{email.priority}</Badge>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{email.template}</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{email.description}</p>
                <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Trigger: <code className="bg-muted px-1 rounded">{email.trigger}</code>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Sample Data:</p>
                  <pre className="text-xs whitespace-pre-wrap font-mono">{JSON.stringify(email.sample, null, 2)}</pre>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            {bulkEmails.map((email, i) => (
              <Card key={i} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h4 className="font-semibold">{email.title}</h4>
                  <Badge variant="secondary">{email.category}</Badge>
                  <Badge variant="outline">Audience: {email.audience}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{email.description}</p>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Sample Data:</p>
                  <pre className="text-xs whitespace-pre-wrap font-mono">{JSON.stringify(email.sample, null, 2)}</pre>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
