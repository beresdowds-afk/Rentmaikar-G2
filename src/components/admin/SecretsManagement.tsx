import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, RotateCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Key, 
  Shield, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  ExternalLink,
  Phone,
  Mail,
  CreditCard,
  AlertTriangle,
  Info,
  Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sent } from "@/integrations/sent/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface SecretConfig {
  name: string;
  displayName: string;
  description: string;
  category: "cpaas_sent" | "sms" | "sms_ng" | "email" | "payment" | "iot" | "voice" | "identity" | "gcp" | "system";
  testable: boolean;
  docsUrl?: string;
  region?: "USA" | "Nigeria" | "Global" | (string & {});
}

const secrets: SecretConfig[] = [
  // Global CPaaS — Sent.dm (Universal OpenAPI v3: SMS, WhatsApp, RCS)
  {
    name: "SENT_API_KEY",
    displayName: "Sent.dm API Key",
    description: "API key for Sent.dm OpenAPI v3 global CPaaS gateway (SMS, WhatsApp, RCS)",
    category: "cpaas_sent",
    testable: true,
    docsUrl: "https://docs.sent.dm/api/openapi/v3",
    region: "Global",
  },
  {
    name: "SENT_SENDER_ID",
    displayName: "Sent.dm Sender ID",
    description: "Registered alphanumeric sender ID or phone number (e.g. 'Rentmaikar' or '+12025550143')",
    category: "cpaas_sent",
    testable: true,
    docsUrl: "https://docs.sent.dm/api/openapi/v3",
    region: "Global",
  },
  {
    name: "SENT_WHATSAPP_NUMBER",
    displayName: "Sent.dm WhatsApp Channel ID / Number",
    description: "WhatsApp-enabled phone number on Sent.dm in +E.164 format",
    category: "cpaas_sent",
    testable: false,
    docsUrl: "https://docs.sent.dm/api/openapi/v3",
    region: "Global",
  },
  {
    name: "SENT_WEBHOOK_SECRET",
    displayName: "Sent.dm Webhook Secret",
    description: "Signing secret used to verify delivery reports & incoming message callbacks from Sent.dm",
    category: "cpaas_sent",
    testable: false,
    docsUrl: "https://docs.sent.dm/api/openapi/v3",
    region: "Global",
  },
  {
    name: "SENT_SANDBOX_MODE",
    displayName: "Sent.dm Sandbox Mode Flag",
    description: "Set to 'true' to run test dispatches via sandbox without incurring telco charges",
    category: "cpaas_sent",
    testable: false,
    docsUrl: "https://docs.sent.dm/api/openapi/v3",
    region: "Global",
  },
  // SMS/WhatsApp — USA (Twilio)
  {
    name: "TWILIO_ACCOUNT_SID",
    displayName: "Twilio Account SID",
    description: "Your Twilio account identifier for USA SMS, WhatsApp, and VoIP",
    category: "sms",
    testable: true,
    docsUrl: "https://www.twilio.com/docs/usage/api",
    region: "USA",
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    displayName: "Twilio Auth Token",
    description: "Authentication token for Twilio API access (USA)",
    category: "sms",
    testable: true,
    docsUrl: "https://www.twilio.com/docs/usage/api",
    region: "USA",
  },
  {
    name: "TWILIO_PHONE_NUMBER",
    displayName: "Twilio Phone Number (USA)",
    description: "The USA phone number used for SMS, WhatsApp, and VoIP calls",
    category: "sms",
    testable: true,
    docsUrl: "https://www.twilio.com/docs/phone-numbers",
    region: "USA",
  },
  // SMS/Voice — Nigeria (Termii)
  {
    name: "TERMII_API_KEY",
    displayName: "Termii API Key",
    description: "API key for Termii SMS, OTP, and Voice services in Nigeria",
    category: "sms_ng",
    testable: true,
    docsUrl: "https://developers.termii.com/",
    region: "Nigeria",
  },
  {
    name: "TERMII_SENDER_ID",
    displayName: "Termii Sender ID",
    description: "Authorized sender ID/number for Nigerian SMS and voice communications",
    category: "sms_ng",
    testable: true,
    docsUrl: "https://developers.termii.com/",
    region: "Nigeria",
  },
  // Email
  {
    name: "RESEND_API_KEY",
    displayName: "Resend API Key",
    description: "API key for sending transactional emails via Resend",
    category: "email",
    testable: true,
    docsUrl: "https://resend.com/docs/api-reference/introduction",
  },
  // Payment - PayPal (USA)
  {
    name: "PAYPAL_CLIENT_ID",
    displayName: "PayPal Client ID",
    description: "PayPal REST API client ID for USA payment processing",
    category: "payment",
    testable: false,
    docsUrl: "https://developer.paypal.com/api/rest/",
    region: "USA",
  },
  {
    name: "PAYPAL_CLIENT_SECRET",
    displayName: "PayPal Client Secret",
    description: "PayPal REST API secret key for authentication",
    category: "payment",
    testable: false,
    docsUrl: "https://developer.paypal.com/api/rest/",
    region: "USA",
  },
  {
    name: "PAYPAL_MODE",
    displayName: "PayPal Mode",
    description: "Set to 'live' for production PayPal transactions or 'sandbox' for testing",
    category: "payment",
    testable: false,
    docsUrl: "https://developer.paypal.com/api/rest/",
    region: "USA",
  },
  // Payment - Paystack (Nigeria)
  {
    name: "PAYSTACK_SECRET_KEY",
    displayName: "Paystack Secret Key",
    description: "Paystack secret key for Nigeria payment processing",
    category: "payment",
    testable: false,
    docsUrl: "https://paystack.com/docs/api/",
    region: "Nigeria",
  },
  {
    name: "PAYSTACK_PUBLIC_KEY",
    displayName: "Paystack Public Key",
    description: "Paystack public key for client-side integration",
    category: "payment",
    testable: false,
    docsUrl: "https://paystack.com/docs/api/",
    region: "Nigeria",
  },
  {
    name: "PAYSTACK_WEBHOOK_SECRET",
    displayName: "Paystack Webhook Secret",
    description: "Signing secret for verifying incoming Paystack webhooks (also fine to reuse the secret key)",
    category: "payment",
    testable: false,
    docsUrl: "https://paystack.com/docs/payments/webhooks",
    region: "Nigeria",
  },
  // Payment - Opay (Nigeria)
  {
    name: "OPAY_MERCHANT_ID",
    displayName: "Opay Merchant ID",
    description: "Opay merchant identifier from the Opay merchant portal",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opayweb.com/",
    region: "Nigeria",
  },
  {
    name: "OPAY_PUBLIC_KEY",
    displayName: "Opay Public Key",
    description: "Opay public key used to authenticate cashier requests",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opayweb.com/",
    region: "Nigeria",
  },
  {
    name: "OPAY_SECRET_KEY",
    displayName: "Opay Secret Key",
    description: "Opay secret key used for HMAC-signing requests and verifying webhooks",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opayweb.com/",
    region: "Nigeria",
  },
  {
    name: "OPAY_ENVIRONMENT",
    displayName: "Opay Environment",
    description: "Set to 'sandbox' for testing or 'live' for production Opay processing",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opayweb.com/",
    region: "Nigeria",
  },
  // IoT / MQTT (EMQX)
  {
    name: "EMQX_API_URL",
    displayName: "EMQX API URL",
    description: "Base URL for the EMQX broker management API",
    category: "iot",
    testable: false,
    docsUrl: "https://docs.emqx.com/en/emqx/latest/admin/api.html",
  },
  {
    name: "EMQX_API_KEY",
    displayName: "EMQX API Key",
    description: "API key for authenticating to the EMQX management API",
    category: "iot",
    testable: false,
    docsUrl: "https://docs.emqx.com/en/emqx/latest/admin/api.html",
  },
  {
    name: "EMQX_API_SECRET",
    displayName: "EMQX API Secret",
    description: "API secret paired with the EMQX API key",
    category: "iot",
    testable: false,
    docsUrl: "https://docs.emqx.com/en/emqx/latest/admin/api.html",
  },
  // Voice / TTS
  {
    name: "ELEVENLABS_API_KEY",
    displayName: "ElevenLabs API Key",
    description: "API key for ElevenLabs text-to-speech (driver training narration)",
    category: "voice",
    testable: false,
    docsUrl: "https://elevenlabs.io/docs/api-reference/introduction",
  },
  // Identity Verification — Persona
  {
    name: "PERSONA_API_KEY",
    displayName: "Persona API Key",
    description: "Persona secret API key for creating inquiries (drivers, owners, referees)",
    category: "identity",
    testable: false,
    docsUrl: "https://docs.withpersona.com/reference/authentication",
  },
  {
    name: "PERSONA_TEMPLATE_ID_US",
    displayName: "Persona Template ID (USA)",
    description: "Persona inquiry template ID for USA verifications",
    category: "identity",
    testable: false,
    region: "USA",
  },
  {
    name: "PERSONA_TEMPLATE_ID_NG",
    displayName: "Persona Template ID (Nigeria)",
    description: "Persona inquiry template ID for Nigeria verifications",
    category: "identity",
    testable: false,
    region: "Nigeria",
  },
  {
    name: "PERSONA_WEBHOOK_SECRET",
    displayName: "Persona Webhook Signing Secret",
    description: "HMAC secret used to verify inbound Persona webhook signatures",
    category: "identity",
    testable: false,
  },
  // Payment — Opay (Nigeria default)
  {
    name: "OPAY_PUBLIC_KEY",
    displayName: "Opay Public Key",
    description: "Opay public key for Nigeria payment processing (default NG PSP)",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opaycheckout.com/",
    region: "Nigeria",
  },
  {
    name: "OPAY_SECRET_KEY",
    displayName: "Opay Secret Key",
    description: "Opay secret key for authenticating server-side payment calls",
    category: "payment",
    testable: false,
    docsUrl: "https://documentation.opaycheckout.com/",
    region: "Nigeria",
  },
  {
    name: "OPAY_MERCHANT_ID",
    displayName: "Opay Merchant ID",
    description: "Opay merchant identifier",
    category: "payment",
    testable: false,
    region: "Nigeria",
  },
  // Telemetry — Traccar (alternative to EMQX)
  {
    name: "TRACCAR_API_URL",
    displayName: "Traccar API URL",
    description: "Base URL of the Traccar server REST API (alternative telemetry provider)",
    category: "iot",
    testable: false,
    docsUrl: "https://www.traccar.org/api-reference/",
  },
  {
    name: "TRACCAR_API_TOKEN",
    displayName: "Traccar API Token",
    description: "Bearer token for authenticating to the Traccar REST API",
    category: "iot",
    testable: false,
  },
  // WhatsApp (referee attestation, notifications)
  {
    name: "TWILIO_WHATSAPP_FROM",
    displayName: "Twilio WhatsApp Sender",
    description: "WhatsApp-enabled Twilio number in whatsapp:+E164 format",
    category: "sms",
    testable: false,
    region: "USA",
  },
  // Google Cloud / ADC
  {
    name: "GOOGLE_APPLICATION_CREDENTIALS",
    displayName: "Google ADC Service Account Key (JSON)",
    description: "Service Account key JSON string or path for Google Cloud Application Default Credentials",
    category: "gcp",
    testable: false,
    docsUrl: "https://cloud.google.com/docs/authentication/application-default-credentials",
    region: "Global",
  },
  {
    name: "GCP_PROJECT_ID",
    displayName: "Google Cloud Project ID",
    description: "Google Cloud Project identifier (e.g. avian-computer-477009-v0)",
    category: "gcp",
    testable: false,
    docsUrl: "https://cloud.google.com/resource-manager/docs/creating-managing-projects",
    region: "Global",
  },
  {
    name: "GCP_CLIENT_ID",
    displayName: "Google OAuth Client ID",
    description: "Client ID for Google Cloud OAuth 2.0 Web Application credentials",
    category: "gcp",
    testable: false,
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    region: "Global",
  },
  {
    name: "GCP_CLIENT_SECRET",
    displayName: "Google OAuth Client Secret",
    description: "Client secret paired with Google OAuth Client ID",
    category: "gcp",
    testable: false,
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    region: "Global",
  },
  // Public app URL (used in outbound links, e.g. referee attestation)
  {
    name: "PUBLIC_APP_URL",
    displayName: "Public App URL",
    description: "Canonical public URL used in outbound emails/SMS (e.g. referee attestation links)",
    category: "system",
    testable: false,
  },
];

const categoryConfig = {
  cpaas_sent: { icon: Globe, label: "Global CPaaS — Sent.dm (SMS, WhatsApp, RCS)", color: "bg-emerald-600", region: "Global" },
  sms: { icon: Phone, label: "SMS/WhatsApp/VoIP — USA (Twilio)", color: "bg-blue-500", region: "USA" },
  sms_ng: { icon: Phone, label: "SMS/Voice — Nigeria (Termii)", color: "bg-emerald-600", region: "Nigeria" },
  email: { icon: Mail, label: "Email", color: "bg-green-500", region: null },
  payment: { icon: CreditCard, label: "Payment Gateways", color: "bg-purple-500", region: null },
  iot: { icon: Shield, label: "IoT / Telemetry (EMQX & Traccar)", color: "bg-orange-500", region: null },
  voice: { icon: Phone, label: "Voice / TTS", color: "bg-pink-500", region: null },
  identity: { icon: Shield, label: "Identity Verification (Persona)", color: "bg-indigo-500", region: null },
  gcp: { icon: Key, label: "Google Cloud / ADC & OAuth", color: "bg-sky-600", region: "Global" },
  system: { icon: Shield, label: "System", color: "bg-gray-500", region: null },
};

export function SecretsManagement() {
  const { user, userRole, twoFactorVerified } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [testingSecret, setTestingSecret] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | null>>({});
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");

  const isAdmin = userRole === "admin";
  const canAccess = isAdmin && twoFactorVerified;

  const unlockPortal = async () => {
    if (!canAccess) {
      toast.error("Requires an admin account with 2FA verified this session.");
      return;
    }
    setUnlocking(true);
    try {
      await supabase.rpc("log_admin_action", {
        _action: "opened_secrets_portal",
        _target_table: null,
        _target_id: null,
        _details: { at: new Date().toISOString() } as any,
      });
      setUnlocked(true);
    } catch (e: any) {
      toast.error(`Access log failed: ${e.message ?? e}`);
    } finally {
      setUnlocking(false);
    }
  };

  const copyChatCommand = async (command: string, action: string, secretName: string) => {
    try {
      await navigator.clipboard.writeText(command);
      await supabase.rpc("log_admin_action", {
        _action: action,
        _target_table: null,
        _target_id: secretName,
        _details: { secret: secretName, command } as any,
      });
      toast.success(
        `Copied. Paste it into the Lovable chat — a secure form will open to enter the value.`,
        { duration: 7000 }
      );
    } catch (e: any) {
      toast.error(`Could not copy: ${e.message ?? e}`);
    }
  };

  const requestRotation = (secretName: string) =>
    copyChatCommand(`Rotate ${secretName}`, "requested_secret_rotation", secretName);

  const requestAddSecret = (secretName: string) =>
    copyChatCommand(`Add secret ${secretName}`, "requested_secret_add", secretName);




  const testSentSecrets = async () => {
    if (!testPhone) {
      toast.error("Please enter a phone number");
      return;
    }

    setTestingSecret("SENT");
    try {
      const res = await sent.sendMessage({
        to: [testPhone],
        channel: "sms",
        text: "This is a test notification from Rentmaikar admin portal via Sent.dm OpenAPI v3 gateway. Delivery operational!",
        sender_id: "Rentmaikar",
        metadata: { source: "admin_secrets_test" },
      });

      if (res.status === "failed" || res.status === "undelivered") {
        throw new Error(res.error?.message || "Sent.dm dispatch failed");
      }

      setTestResults((prev) => ({
        ...prev,
        SENT_API_KEY: "success",
        SENT_SENDER_ID: "success",
      }));
      toast.success(`Sent.dm test dispatch successful! ID: ${res.id}`);
      setTestDialogOpen(false);
    } catch (error: any) {
      setTestResults((prev) => ({
        ...prev,
        SENT_API_KEY: "error",
        SENT_SENDER_ID: "error",
      }));
      toast.error(`Sent.dm test failed: ${error.message}`);
    } finally {
      setTestingSecret(null);
    }
  };

  const testTwilioSecrets = async () => {
    if (!testPhone) {
      toast.error("Please enter a phone number");
      return;
    }

    setTestingSecret("TWILIO");
    try {
      const { error } = await supabase.functions.invoke("send-sms-notification", {
        body: {
          phone: testPhone,
          channel: "sms",
          notificationType: "general",
          customMessage: "This is a test message from Rentmaikar admin panel. Your Twilio configuration is working correctly!",
        },
      });

      if (error) throw error;

      setTestResults((prev) => ({
        ...prev,
        TWILIO_ACCOUNT_SID: "success",
        TWILIO_AUTH_TOKEN: "success",
        TWILIO_PHONE_NUMBER: "success",
      }));
      toast.success("Test SMS sent successfully!");
      setTestDialogOpen(false);
    } catch (error: any) {
      setTestResults((prev) => ({
        ...prev,
        TWILIO_ACCOUNT_SID: "error",
        TWILIO_AUTH_TOKEN: "error",
        TWILIO_PHONE_NUMBER: "error",
      }));
      toast.error(`Twilio test failed: ${error.message}`);
    } finally {
      setTestingSecret(null);
    }
  };

  const testResendSecret = async () => {
    if (!testEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setTestingSecret("RESEND_API_KEY");
    try {
      const { error } = await supabase.functions.invoke("send-approval-notification", {
        body: {
          email: testEmail,
          name: "Admin Test",
          userType: "driver",
          region: "USA",
        },
      });

      if (error) throw error;

      setTestResults((prev) => ({ ...prev, RESEND_API_KEY: "success" }));
      toast.success("Test email sent successfully!");
      setTestDialogOpen(false);
    } catch (error: any) {
      setTestResults((prev) => ({ ...prev, RESEND_API_KEY: "error" }));
      toast.error(`Resend test failed: ${error.message}`);
    } finally {
      setTestingSecret(null);
    }
  };

  const getStatusBadge = (secretName: string) => {
    const result = testResults[secretName];
    if (result === "success") {
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      );
    }
    if (result === "error") {
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-muted">
        <Key className="w-3 h-3 mr-1" />
        Configured
      </Badge>
    );
  };

  const groupedSecrets = secrets.reduce((acc, secret) => {
    if (!acc[secret.category]) acc[secret.category] = [];
    acc[secret.category].push(secret);
    return acc;
  }, {} as Record<string, SecretConfig[]>);

  if (!unlocked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Secrets Management</h2>
          <p className="text-muted-foreground">
            Gated portal — admin access with 2FA required
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Restricted area
            </CardTitle>
            <CardDescription>
              This portal lists third-party credentials configured for the platform. Access is
              limited to admins with 2FA verified in the current session. Each unlock is written
              to the admin audit log.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user && <p className="text-sm text-destructive">You are not signed in.</p>}
            {user && !isAdmin && (
              <p className="text-sm text-destructive">Your account is not an admin.</p>
            )}
            {user && isAdmin && !twoFactorVerified && (
              <p className="text-sm text-destructive">
                2FA is not verified for this session. Sign out and back in with your 2FA code.
              </p>
            )}
            <Button onClick={unlockPortal} disabled={!canAccess || unlocking}>
              {unlocking ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Unlocking…</>
              ) : (
                <><Lock className="w-4 h-4 mr-2" />Unlock secrets portal</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Secrets Management</h2>
          <p className="text-muted-foreground">
            View and test configured API keys. All actions are audit-logged.
          </p>
        </div>
        <AddSecretDialog onRequest={requestAddSecret} />
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How saving works</AlertTitle>
        <AlertDescription>
          Secret values are never stored in this app — they live in Lovable Cloud's encrypted vault
          and are only readable by server-side edge functions. To add or update a value, use the
          buttons here: they copy the exact chat command that opens a secure Lovable form. Pasting
          the value into any UI in this app would expose it in the browser bundle.
        </AlertDescription>
      </Alert>


      <div className="grid gap-6">
        {Object.entries(groupedSecrets).map(([category, categorySecrets]) => {
          const config = categoryConfig[category as keyof typeof categoryConfig];
          const CategoryIcon = config.icon;

          return (
            <Card key={category}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                    <CategoryIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{config.label} Services</CardTitle>
                    <CardDescription>
                      {categorySecrets.length} secret{categorySecrets.length > 1 ? "s" : ""} configured
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categorySecrets.map((secret) => (
                    <div
                      key={secret.name}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{secret.displayName}</p>
                          {getStatusBadge(secret.name)}
                        </div>
                        <p className="text-sm text-muted-foreground">{secret.description}</p>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{secret.name}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        {secret.docsUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(secret.docsUrl, "_blank")}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestRotation(secret.name)}
                        >
                          <RotateCw className="w-4 h-4 mr-1" />
                          Request rotation
                        </Button>
                      </div>

                    </div>
                  ))}

                  {category === "cpaas_sent" && (
                    <Dialog open={testDialogOpen && testingSecret === "SENT"} onOpenChange={setTestDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setTestingSecret("SENT");
                            setTestDialogOpen(true);
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Test Sent.dm OpenAPI v3 Configuration
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Test Sent.dm Global CPaaS Dispatch</DialogTitle>
                          <DialogDescription>
                            Enter a destination phone number in E.164 format (+1..., +234..., etc.) to dispatch a test message via Sent.dm v3.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="test-phone-sent">Phone Number (E.164)</Label>
                            <Input
                              id="test-phone-sent"
                              placeholder="+12025550143 or +2348012345678"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Works across all international destinations via Sent.dm unified gateway.
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={testSentSecrets} disabled={testingSecret === "SENT"}>
                            {testingSecret === "SENT" ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Dispathing via Sent.dm...
                              </>
                            ) : (
                              <>
                                <Globe className="w-4 h-4 mr-2" />
                                Send Test via Sent.dm
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {category === "sms" && (
                    <Dialog open={testDialogOpen && testingSecret === "TWILIO"} onOpenChange={setTestDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setTestDialogOpen(true)}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Test Twilio Configuration
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Test Twilio SMS</DialogTitle>
                          <DialogDescription>
                            Enter a phone number to receive a test SMS message.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="test-phone">Phone Number</Label>
                            <Input
                              id="test-phone"
                              placeholder="+12025550123"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Use international format (e.g., +1 for USA, +234 for Nigeria)
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={testTwilioSecrets} disabled={testingSecret === "TWILIO"}>
                            {testingSecret === "TWILIO" ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Phone className="w-4 h-4 mr-2" />
                                Send Test SMS
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {category === "email" && (
                    <Dialog open={testDialogOpen && testingSecret === "RESEND_API_KEY"} onOpenChange={setTestDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setTestingSecret("RESEND_API_KEY");
                            setTestDialogOpen(true);
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Test Resend Configuration
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Test Resend Email</DialogTitle>
                          <DialogDescription>
                            Enter an email address to receive a test email.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="test-email">Email Address</Label>
                            <Input
                              id="test-email"
                              type="email"
                              placeholder="test@example.com"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={testResendSecret} disabled={testingSecret === "RESEND_API_KEY"}>
                            {testingSecret === "RESEND_API_KEY" ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="w-4 h-4 mr-2" />
                                Send Test Email
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            How to Update Secrets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To update API secrets, follow these steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Open the Lovable chat interface</li>
            <li>Request to update the specific secret (e.g., "Update my Twilio API key")</li>
            <li>Lovable will provide a secure form to enter the new value</li>
            <li>Submit the form to update the secret</li>
            <li>Return here to test the new configuration</li>
          </ol>
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Available Secrets:</p>
            <div className="flex flex-wrap gap-2">
              {secrets.map((s) => (
                <code key={s.name} className="text-xs bg-muted px-2 py-1 rounded">
                  {s.name}
                </code>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddSecretDialog({ onRequest }: { onRequest: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const valid = /^[A-Z_][A-Z0-9_]*$/.test(name);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Key className="w-4 h-4 mr-2" />
          Add new secret
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new secret</DialogTitle>
          <DialogDescription>
            Enter the secret name (uppercase, underscores). We'll copy a chat command; paste it
            into Lovable chat and a secure form will open to enter the value. Values are never
            typed into this app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="secret-name">Secret name</Label>
          <Input
            id="secret-name"
            placeholder="MY_NEW_API_KEY"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
          />
          {!valid && name.length > 0 && (
            <p className="text-xs text-destructive">
              Use only A–Z, 0–9 and underscore; must start with a letter or underscore.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onRequest(name);
              setOpen(false);
              setName("");
            }}
          >
            Copy chat command
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

