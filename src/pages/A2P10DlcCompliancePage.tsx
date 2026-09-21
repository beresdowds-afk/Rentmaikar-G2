import { useState } from "react";
import { Link } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  FileText,
  Building2,
  MessageSquare,
  KeyRound,
  FileCheck2,
  Clock,
  Lock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { download10DlcPdf } from "@/lib/generate-10dlc-pdf";

export default function A2P10DlcCompliancePage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast({
      title: "Copied to clipboard",
      description: `${label} copied for TCR/Twilio submission.`,
    });
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownloadPdf = () => {
    try {
      download10DlcPdf("rentmaikar-10dlc-a2p-compliance-packet.pdf");
      toast({
        title: "PDF Download Started",
        description: "Rentmaikar 10DLC A2P Compliance Packet is downloading.",
      });
    } catch {
      // Fallback to static URL
      window.location.href = "/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Seo
        title="A2P 10DLC Campaign Dossier & Evidence Packet | Rentmaikar"
        description="Official A2P 10DLC Brand and Campaign Registration dossier for Rentmaikar, containing verified brand info, TCR campaign attributes, opt-in disclosures, sample messages, and privacy clauses."
      />
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl space-y-6">
        {/* Header Banner */}
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" /> TCR &amp; Carrier Verified
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Version 2026-08-14.v1
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                A2P 10DLC Compliance &amp; Campaign Packet
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Official submission dossier required for The Campaign Registry (TCR), Twilio, and US Tier-1 mobile carrier approval for Rentmaikar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button onClick={handleDownloadPdf} className="gap-2 shadow-sm font-semibold">
                <Download className="w-4 h-4" />
                Download PDF Dossier
              </Button>
              <a
                href="/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf"
                target="_blank"
                rel="noopener noreferrer"
                download="rentmaikar-10dlc-a2p-compliance-packet.pdf"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                Direct Link
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t text-xs">
            <div>
              <span className="text-muted-foreground block">Registered Owner:</span>
              <span className="font-semibold text-foreground">INTE-GRITTY LLC USA</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Brand / DBA:</span>
              <span className="font-semibold text-foreground">Rentmaikar</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Campaign Type:</span>
              <span className="font-semibold text-foreground">Standard / MIXED</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Verified 10DLC Route:</span>
              <span className="font-semibold text-foreground">+1 (608) 384-3932</span>
            </div>
          </div>
        </div>

        {/* Quick Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full h-auto p-1">
            <TabsTrigger value="overview" className="py-2 text-xs sm:text-sm">
              <Building2 className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Brand &amp; Campaign
            </TabsTrigger>
            <TabsTrigger value="optin" className="py-2 text-xs sm:text-sm">
              <FileCheck2 className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Opt-In Flow
            </TabsTrigger>
            <TabsTrigger value="messages" className="py-2 text-xs sm:text-sm">
              <MessageSquare className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Sample SMS
            </TabsTrigger>
            <TabsTrigger value="keywords" className="py-2 text-xs sm:text-sm">
              <KeyRound className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Keywords &amp; Timing
            </TabsTrigger>
            <TabsTrigger value="evidence" className="py-2 text-xs sm:text-sm">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 hidden sm:inline" />
              Evidence Links
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Brand & Campaign Attributes */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    1. Brand &amp; Business Information (TCR Brand Registration)
                  </CardTitle>
                  <CardDescription>
                    Legal entity parameters verified against US business registries.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Legal Business Name</span>
                    <p className="font-semibold text-foreground">INTE-GRITTY LLC</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Registered Corporate Owner</span>
                    <p className="font-semibold text-foreground">INTE-GRITTY LLC USA</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Doing Business As (DBA)</span>
                    <p className="font-semibold text-foreground">Rentmaikar</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Corporate Relationship</span>
                    <p className="font-medium text-foreground">Rentmaikar is the official vehicle rental platform wholly owned and operated by INTE-GRITTY LLC USA</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Country of Registration</span>
                    <p className="font-medium text-foreground">United States of America</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Organization Type</span>
                    <p className="font-medium text-foreground">Limited Liability Company (LLC) registered in the United States</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Industry Sector</span>
                    <p className="font-medium text-foreground">Transportation / Vehicle Rental &amp; Rideshare Fleet</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Website URL</span>
                    <a href="https://www.rentmaikar.com" target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-medium">
                      https://www.rentmaikar.com <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Support Email</span>
                    <p className="font-medium text-foreground">support@rentmaikar.com</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Compliance Contact</span>
                    <p className="font-medium text-foreground">compliance@rentmaikar.com</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Customer Support Phone</span>
                    <p className="font-medium text-foreground">+1 (608) 548-9220</p>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Twilio Published 10DLC Route</span>
                    <p className="font-medium text-foreground">+1 (608) 384-3932</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    2. Campaign Description (Verbatim Submission Copy)
                  </CardTitle>
                  <CardDescription>
                    Exact text approved for the TCR/Twilio Campaign Description field.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(
                      "Rentmaikar (wholly owned and operated by INTE-GRITTY LLC USA) is a vehicle rental platform connecting rideshare drivers with vehicle owners in the United States and Nigeria. This campaign sends text messages only to users who created an account on rentmaikar.com and explicitly checked an optional SMS consent checkbox. Messages cover account and identity verification, rental application and approval status, vehicle pickup and inspection scheduling, payment reminders and receipts, agreement renewals, and customer support replies. A separate optional checkbox covers promotional messages about vehicle availability and offers. SMS consent is never a condition of creating an account, renting a vehicle, or using any Rentmaikar service.",
                      "Campaign Description"
                    )
                  }
                  className="gap-1.5 text-xs"
                >
                  {copiedKey === "Campaign Description" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Field
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-muted/50 rounded-lg border font-mono text-xs sm:text-sm leading-relaxed text-foreground">
                  Rentmaikar (wholly owned and operated by INTE-GRITTY LLC USA) is a vehicle rental platform connecting rideshare drivers with vehicle owners in the United States and Nigeria. This campaign sends text messages only to users who created an account on rentmaikar.com and explicitly checked an optional SMS consent checkbox. Messages cover account and identity verification, rental application and approval status, vehicle pickup and inspection scheduling, payment reminders and receipts, agreement renewals, and customer support replies. A separate optional checkbox covers promotional messages about vehicle availability and offers. SMS consent is never a condition of creating an account, renting a vehicle, or using any Rentmaikar service.
                </div>
                <p className="text-xs text-muted-foreground">
                  Length: 760 characters (limit: 4096). Confirms unbundled, optional consent and legal parent entity.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Opt-In Mechanism */}
          <TabsContent value="optin" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-primary" />
                    Opt-In Flow &amp; Call-to-Action Description
                  </CardTitle>
                  <CardDescription>
                    Copy for the TCR &quot;Call-to-Action (CTA) / Opt-in Description&quot; field.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(
                      'End users opt in on the Rentmaikar website at https://www.rentmaikar.com/auth, https://www.rentmaikar.com/driver-registration and https://www.rentmaikar.com/owner-registration, and on the standalone public opt-in page https://www.rentmaikar.com/sms-opt-in. During account creation and registration the user sees a dedicated "Text message (SMS) consent — optional" block containing two separate checkboxes, both unchecked by default and both independent of Terms acceptance: one for service/transactional SMS and one for promotional SMS. Consent is not a condition of purchase or service. Users can also opt in or out at any time from Profile Settings > SMS consent & preferences at https://www.rentmaikar.com/profile-settings. Every opt-in and opt-out is stored with the phone number, the exact disclosure text and version shown, the page it was captured from, the timestamp and the user agent.',
                      "Opt-In Flow Description"
                    )
                  }
                  className="gap-1.5 text-xs"
                >
                  {copiedKey === "Opt-In Flow Description" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy Field
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border font-mono text-xs sm:text-sm leading-relaxed text-foreground">
                  End users opt in on the Rentmaikar website at https://www.rentmaikar.com/auth, https://www.rentmaikar.com/driver-registration and https://www.rentmaikar.com/owner-registration, and on the standalone public opt-in page https://www.rentmaikar.com/sms-opt-in. During account creation and registration the user sees a dedicated &quot;Text message (SMS) consent — optional&quot; block containing two separate checkboxes, both unchecked by default and both independent of Terms acceptance: one for service/transactional SMS and one for promotional SMS. Consent is not a condition of purchase or service. Users can also opt in or out at any time from Profile Settings &gt; SMS consent &amp; preferences at https://www.rentmaikar.com/profile-settings. Every opt-in and opt-out is stored with the phone number, the exact disclosure text and version shown, the page it was captured from, the timestamp and the user agent.
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="font-semibold text-sm">Exact Production Checkbox Disclosures (Version 2026-08-14.v1):</h3>
                  
                  <div className="p-3 bg-background rounded-lg border border-primary/20 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">Service / Transactional SMS Checkbox (Unchecked by default)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() =>
                          copyToClipboard(
                            "I agree to receive text messages from Rentmaikar regarding my account, vehicle rentals, applications, reservations, payments, customer support and service updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchasing or using Rentmaikar services. See our Terms and Privacy Policy.",
                            "Service SMS Checkbox Text"
                          )
                        }
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      &quot;I agree to receive text messages from Rentmaikar regarding my account, vehicle rentals, applications, reservations, payments, customer support and service updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchasing or using Rentmaikar services. See our Terms and Privacy Policy.&quot;
                    </p>
                  </div>

                  <div className="p-3 bg-background rounded-lg border border-border space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Promotional SMS Checkbox (Separate &amp; Optional)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() =>
                          copyToClipboard(
                            "I would like to receive optional promotional text messages from Rentmaikar, including special offers, vehicle availability and rental opportunities. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.",
                            "Promotional SMS Checkbox Text"
                          )
                        }
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      &quot;I would like to receive optional promotional text messages from Rentmaikar, including special offers, vehicle availability and rental opportunities. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.&quot;
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Mandatory Privacy Policy SMS Clause
                </CardTitle>
                <CardDescription>
                  Published on https://www.rentmaikar.com/privacy (strictly required for 10DLC approval).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <blockquote className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-l-4 border-emerald-500 rounded-r-lg text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
                  &quot;Rentmaikar and its registered corporate owner INTE-GRITTY LLC USA do not sell, rent, or share mobile phone numbers or SMS consent information with third parties or affiliates for their own marketing or promotional purposes. Any sharing with service providers is strictly limited to telecommunication delivery partners for the sole purpose of transmitting your requested messages.&quot;
                </blockquote>
                <p className="text-xs text-muted-foreground">
                  This exact statement is published under the SMS / Text Message Program section in Rentmaikar&apos;s live Privacy Policy.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Sample Messages */}
          <TabsContent value="messages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Production Sample Messages (TCR Submission)
                </CardTitle>
                <CardDescription>
                  Every sample explicitly identifies Rentmaikar as the sender and includes opt-out (STOP) instructions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    id: 1,
                    type: "Account Security / 2FA OTP",
                    text: "Rentmaikar: Your verification code is 481920. It expires in 10 minutes. Reply STOP to opt out, HELP for help.",
                  },
                  {
                    id: 2,
                    type: "Rental Application & Approval",
                    text: "Rentmaikar: Your driver application has been approved. Sign in at rentmaikar.com to complete your documents and pickup details. Reply STOP to opt out.",
                  },
                  {
                    id: 3,
                    type: "Payment Notice & Due Date",
                    text: "Rentmaikar: Your rental payment of $210.00 is due on Fri Aug 21. Pay at rentmaikar.com/payments. Msg&data rates may apply. Reply STOP to opt out.",
                  },
                  {
                    id: 4,
                    type: "Vehicle Pickup & Schedule",
                    text: "Rentmaikar: Vehicle pickup confirmed for Sat Aug 22, 10:00 AM. Details: rentmaikar.com/dashboard. Reply STOP to opt out, HELP for help.",
                  },
                  {
                    id: 5,
                    type: "Promotional Fleet Notice (Consent Only)",
                    text: "Rentmaikar: New vehicles are available in your city this week. See them at rentmaikar.com/catalogue. Reply STOP to opt out.",
                  },
                ].map((sample) => (
                  <div key={sample.id} className="p-3.5 bg-muted/40 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary">
                        Sample {sample.id} — {sample.type}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs gap-1"
                        onClick={() => copyToClipboard(sample.text, `Sample ${sample.id}`)}
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </Button>
                    </div>
                    <p className="font-mono text-xs sm:text-sm bg-background p-2.5 rounded border text-foreground">
                      {sample.text}
                    </p>
                    <span className="text-[11px] text-muted-foreground block">
                      Character count: {sample.text.length} · Single 160-char GSM-7 segment
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Keywords & Timing */}
          <TabsContent value="keywords" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  Mandatory Program Keywords &amp; Automated Replies
                </CardTitle>
                <CardDescription>
                  Handled automatically by Twilio Advanced Opt-Out and application webhooks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3">
                  <div className="p-4 bg-muted/40 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="destructive">STOP / CANCEL / UNSUBSCRIBE</Badge>
                      <span className="text-xs text-muted-foreground">Immediate Opt-Out</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Action:</strong> Immediately updates database to opt-out and suppresses further dispatches.
                    </p>
                    <p className="font-mono text-xs bg-background p-2 rounded border text-foreground">
                      &quot;Rentmaikar: You have been unsubscribed and will receive no further messages. Reply START to re-subscribe.&quot;
                    </p>
                  </div>

                  <div className="p-4 bg-muted/40 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-blue-600 border-blue-400">HELP / INFO</Badge>
                      <span className="text-xs text-muted-foreground">Support Assistance</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Action:</strong> Provides direct contact channels and disclosures.
                    </p>
                    <p className="font-mono text-xs bg-background p-2 rounded border text-foreground">
                      &quot;Rentmaikar: For help email support@rentmaikar.com or call +1 (608) 548-9220. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out.&quot;
                    </p>
                  </div>

                  <div className="p-4 bg-muted/40 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-green-600 border-green-400">START / UNSTOP</Badge>
                      <span className="text-xs text-muted-foreground">Re-Subscription</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Action:</strong> Restores messaging status for verified subscriber.
                    </p>
                    <p className="font-mono text-xs bg-background p-2 rounded border text-foreground">
                      &quot;Rentmaikar: You are re-subscribed to Rentmaikar text messages. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.&quot;
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Opt-In Timing &amp; Quiet Hours Disclosure
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Instant verification:</strong> Security/2FA codes dispatched within seconds of user request.</li>
                  <li><strong>Service messages:</strong> Triggered on account events (approvals, vehicle pickup dates, invoices).</li>
                  <li><strong>Promotional messages:</strong> Capped at 2–4 per month, sent strictly to promotional opt-ins.</li>
                  <li><strong>Quiet hours:</strong> Strictly 9:00 AM – 9:00 PM recipient local time (US) or 8:00 AM – 8:00 PM WAT (Nigeria).</li>
                  <li><strong>Revocation:</strong> Opting out via STOP or Profile Settings is immediate.</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: Evidence Links */}
          <TabsContent value="evidence" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Live Production Evidence Links for Carrier Reviewers
                </CardTitle>
                <CardDescription>
                  Reviewers may test and inspect these active URLs directly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  {[
                    { label: "1. Dedicated SMS Opt-In Page", url: "/sms-opt-in", desc: "Standalone form showing keywords, timing, and optional checkboxes." },
                    { label: "2. Driver Registration Form", url: "/driver-registration", desc: "Shows unbundled optional SMS checkboxes during driver signup." },
                    { label: "3. Owner Registration Form", url: "/owner-registration", desc: "Shows unbundled optional SMS checkboxes during owner signup." },
                    { label: "4. Privacy Policy (SMS Clause)", url: "/privacy", desc: "Includes explicit non-sharing clause for mobile number & consent data." },
                    { label: "5. Terms & Conditions", url: "/terms", desc: "Contains SMS program terms, rate notices, and STOP/HELP instructions." },
                    { label: "6. SMS Consent Audit Trail (Admin)", url: "/admin/sms-consent-audit", desc: "Database audit records showing timestamp, phone, page, and version." },
                    { label: "7. Downloadable PDF Dossier", url: "/downloads/rentmaikar-10dlc-a2p-compliance-packet.pdf", desc: "Formatted 4-page official submission PDF document." },
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/40 rounded-lg border gap-2">
                      <div>
                        <span className="font-semibold text-foreground block">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{item.desc}</span>
                      </div>
                      <Link
                        to={item.url}
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline self-start sm:self-center"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
